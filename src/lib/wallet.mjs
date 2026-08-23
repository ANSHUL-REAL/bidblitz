import { encodeFunctionData, toHex } from 'viem'
import { monad, EXPLORER, PUBLIC_RPCS, GAS, MAX_FEE, MAX_PRIORITY_FEE } from './chain.mjs'
import { BIDBLITZ_ABI } from './abi.mjs'
import { CONTRACT, readClient } from './tx.mjs'

/**
 * The wallet path for every on-chain room — no longer the secondary option.
 *
 * Works with any injected EIP-1193 provider — MetaMask, Rabby, OKX, Backpack.
 * NOTE: Lace is a Cardano wallet and does not implement EIP-1193, so it cannot
 * talk to Monad (or any EVM chain) at all.
 *
 * This used to sit underneath a name+password burner that the platform funded
 * by airdrop. Both halves of that were wrong for a public app: the platform was
 * buying strangers' gas, and a wallet derived from one keccak of a guessable
 * password is not somewhere real MON should sit. Rooms that want the
 * fifteen-second, no-wallet join are now FREE rooms, which are off-chain and
 * hold no value at all.
 */

// 10143
export const MONAD_HEX_CHAIN_ID = toHex(monad.id)

export const ADD_CHAIN_PARAMS = {
  chainId: MONAD_HEX_CHAIN_ID,
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: [PUBLIC_RPCS[0]],
  blockExplorerUrls: [EXPLORER],
}

export function getProvider() {
  if (typeof window === 'undefined') return null
  const eth = window.ethereum
  if (!eth) return null
  // With several wallets installed, providers land in an array; prefer MetaMask.
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0]
  }
  return eth
}

export const hasInjectedWallet = () => Boolean(getProvider())

export function walletLabel() {
  const p = getProvider()
  if (!p) return null
  if (p.isRabby) return 'Rabby'
  if (p.isBackpack) return 'Backpack'
  if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet'
  if (p.isMetaMask) return 'MetaMask'
  return 'your wallet'
}

/**
 * Same surface as the burner Signer, so every call site is identical and the
 * contract never learns which kind of wallet signed.
 */
export class InjectedSigner {
  constructor(provider, address) {
    this.provider = provider
    this.address = address
    this.injected = true
    this.nonce = null
  }

  /**
   * Silent reconnect on page load — eth_accounts returns the already-authorised
   * account WITHOUT raising a popup, so a bidder who reloads mid-lot lands back
   * in the room instead of being asked to approve again.
   * Returns null when nothing is connected; never throws.
   */
  static async restore() {
    const provider = getProvider()
    if (!provider) return null
    try {
      const accounts = await provider.request({ method: 'eth_accounts' })
      return accounts?.length ? new InjectedSigner(provider, accounts[0]) : null
    } catch {
      return null
    }
  }

  static async connect() {
    const provider = getProvider()
    if (!provider) {
      throw new Error('No EVM wallet found. Install MetaMask, Rabby, OKX or Backpack — or join a Free room, which needs no wallet.')
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' })
    if (!accounts?.length) throw new Error('No account authorised')

    // Switch first; only add the network if the wallet has never seen it.
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD_HEX_CHAIN_ID }],
      })
    } catch (err) {
      const code = err?.code ?? err?.data?.originalError?.code
      if (code === 4902 || code === -32603) {
        await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_CHAIN_PARAMS] })
      } else if (code === 4001) {
        throw new Error('You declined the network switch')
      } else {
        throw err
      }
    }

    return new InjectedSigner(provider, accounts[0])
  }

  async syncNonce() {
    this.nonce = await readClient.getTransactionCount({ address: this.address, blockTag: 'latest' })
    return this.nonce
  }

  async balance() {
    return readClient.getBalance({ address: this.address })
  }

  /**
   * The wallet signs AND broadcasts, so this path skips /api/send. That proxy
   * exists to keep 70 phones off one shared IP; a handful of wallet users do not
   * need it, and routing through it would mean asking the wallet for a raw
   * signature it will not hand over.
   */
  async send(functionName, args, gas, value = 0n) {
    if (!CONTRACT) throw new Error('The BidBlitz contract is not deployed yet — this is a one-time setup step by the organizer.')
    const data = encodeFunctionData({ abi: BIDBLITZ_ABI, functionName, args })
    const tx = {
      from: this.address,
      to: CONTRACT,
      data,
      gas: toHex(gas),
      maxFeePerGas: toHex(MAX_FEE),
      maxPriorityFeePerGas: toHex(MAX_PRIORITY_FEE),
    }
    if (value && BigInt(value) > 0n) tx.value = toHex(BigInt(value))
    try {
      return await this.provider.request({ method: 'eth_sendTransaction', params: [tx] })
    } catch (err) {
      if (err?.code === 4001) throw new Error('You rejected the transaction')
      throw new Error(String(err?.shortMessage || err?.message || err).slice(0, 140))
    }
  }

  /**
   * A plain value transfer to an arbitrary address, with optional calldata.
   *
   * Used to buy point packs: the MON goes to the treasury and the calldata
   * carries a memo binding the payment to one player in one room, so nobody can
   * claim somebody else's payment by watching the chain for hashes.
   *
   * Deliberately separate from send() above, which always targets the BidBlitz
   * contract and encodes a function call.
   */
  async sendValue(to, value, data = '0x', gas = 26_000n) {
    const tx = {
      from: this.address,
      to,
      value: toHex(BigInt(value)),
      gas: toHex(gas),
      maxFeePerGas: toHex(MAX_FEE),
      maxPriorityFeePerGas: toHex(MAX_PRIORITY_FEE),
    }
    if (data && data !== '0x') tx.data = data
    try {
      return await this.provider.request({ method: 'eth_sendTransaction', params: [tx] })
    } catch (err) {
      if (err?.code === 4001) throw new Error('You cancelled the payment')
      throw new Error(String(err?.shortMessage || err?.message || err).slice(0, 140))
    }
  }

  createRoom(name, mode = 0, escrow = false) {
    return this.send('createRoom', [name, Number(mode), Boolean(escrow)], GAS.createRoom)
  }
  joinSquad(roomId, squadId) { return this.send('joinSquad', [Number(roomId), squadId], GAS.joinSquad) }
  joinSolo(roomId) { return this.send('joinSolo', [Number(roomId)], GAS.joinSolo) }
  placeBid(roomId, lotId, amount, value = 0n) {
    return this.send('placeBid', [Number(roomId), Number(lotId), BigInt(amount)], GAS.placeBid, BigInt(value || 0n))
  }
  /** Real-MON: settle a lot you won. The bid was a commitment; this pays it. */
  payLot(roomId, lotId, amount) {
    return this.send('payLot', [Number(roomId), Number(lotId)], GAS.payLot, BigInt(amount))
  }
  /** Real-MON: the winner never paid, so put the lot back on the block. */
  defaultLot(roomId, lotId) {
    return this.send('defaultLot', [Number(roomId), Number(lotId)], GAS.defaultLot)
  }
  withdraw() { return this.send('withdraw', [], GAS.withdraw) }
  startLot(roomId, name, image, duration) {
    return this.send('startLot', [Number(roomId), name, image, Number(duration)], GAS.startLot)
  }
  sellLot(roomId, lotId) { return this.send('sellLot', [Number(roomId), Number(lotId)], GAS.sellLot) }
  closeLot(roomId) { return this.send('closeLot', [Number(roomId)], GAS.closeLot) }
  finalize(roomId, lotId) { return this.send('finalize', [Number(roomId), Number(lotId)], GAS.finalize) }
}

/** Add Monad to the wallet without connecting — handy from a settings link. */
export async function addMonadToWallet() {
  const provider = getProvider()
  if (!provider) throw new Error('No EVM wallet found')
  await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_CHAIN_PARAMS] })
}
