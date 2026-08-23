import { encodeFunctionData, createPublicClient, http, fallback } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monad, PUBLIC_RPCS, POLLING_INTERVAL, MAX_FEE, MAX_PRIORITY_FEE, GAS, TYPICAL_GAS_PRICE } from './chain.mjs'
import { BIDBLITZ_ABI } from './abi.mjs'

export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT

/**
 * Browser-side signing.
 *
 * Everything here exists to make one tap cost ONE network call. Left to itself,
 * viem's writeContract fires eth_chainId + eth_getTransactionCount +
 * eth_estimateGas + eth_maxPriorityFeePerGas + eth_sendRawTransaction + ~12
 * receipt polls — about 16 calls. Fifteen people tapping in the first three
 * seconds of a lot is ~240 calls from a single NAT'd venue IP, which gets the
 * whole room rate-limited and looks exactly like the app froze.
 *
 * So: every transaction field is supplied explicitly (zero preparation calls),
 * the signed blob goes to our own /api/send, and we never wait for a receipt —
 * confirmation arrives via the /api/state poll the page is already doing.
 */

// Reads only (balance, nonce resync). Bids never go out this way.
export const readClient = createPublicClient({
  chain: monad,
  transport: fallback(PUBLIC_RPCS.map((u) => http(u)), { rank: false }),
  pollingInterval: POLLING_INTERVAL,
})

export class Signer {
  constructor(privateKey) {
    this.account = privateKeyToAccount(privateKey)
    this.address = this.account.address
    this.nonce = null
  }

  /**
   * Seed or repair the local nonce from what the chain reports. Ratchets
   * FORWARD only: 'latest' excludes a still-pending tx (e.g. the join), so a
   * naive resync would rewind beneath it and the next send (the first bid)
   * would reuse that nonce — Monad then silently drops one of the two. Taking
   * the max keeps us sequenced behind anything in flight while still jumping
   * forward to heal a genuine gap.
   */
  async syncNonce() {
    const chain = await readClient.getTransactionCount({
      address: this.address,
      blockTag: 'latest',
    })
    this.nonce = this.nonce === null ? chain : Math.max(this.nonce, chain)
    return this.nonce
  }

  async balance() {
    return readClient.getBalance({ address: this.address })
  }

  async send(functionName, args, gas, value = 0n) {
    if (!CONTRACT) throw new Error('The BidBlitz contract is not deployed yet — this is a one-time setup step by the organizer.')
    if (this.nonce === null) await this.syncNonce()

    const data = encodeFunctionData({ abi: BIDBLITZ_ABI, functionName, args })

    // Two attempts: a nonce mismatch (local counter fell behind the chain after
    // a page nav, or ran ahead of a dropped tx) is recoverable — trust the chain
    // and retry once, so the host/bidder never has to manually refresh mid-event.
    for (let attempt = 0; attempt < 2; attempt++) {
      const nonce = this.nonce
      const raw = await this.account.signTransaction({
        to: CONTRACT,
        data,
        gas,
        maxFeePerGas: MAX_FEE,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE,
        nonce,
        chainId: monad.id,
        type: 'eip1559',
        value: BigInt(value || 0n),
      })

      // Optimistic: advance immediately so rapid taps don't collide.
      this.nonce = nonce + 1

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw }),
      })

      if (res.ok) return (await res.json()).hash

      this.nonce = nonce // roll back the optimistic bump
      const { error } = await res.json().catch(() => ({}))
      if (attempt === 0 && /nonce/i.test(String(error || ''))) {
        // Hard-resync to what the chain actually reports, then retry.
        this.nonce = await readClient.getTransactionCount({ address: this.address, blockTag: 'latest' })
        continue
      }
      throw new Error(error || `send failed (${res.status})`)
    }
  }

  // --- room-scoped calls -----------------------------------------------------
  createRoom(name, mode = 0, escrow = false) {
    return this.send('createRoom', [name, Number(mode), Boolean(escrow)], GAS.createRoom)
  }
  joinSquad(roomId, squadId) { return this.send('joinSquad', [Number(roomId), squadId], GAS.joinSquad) }
  joinSolo(roomId) { return this.send('joinSolo', [Number(roomId)], GAS.joinSolo) }
  // In an escrow (real-MON) room the bid amount must be sent as msg.value.
  placeBid(roomId, lotId, amount, value = 0n) {
    return this.send('placeBid', [Number(roomId), Number(lotId), BigInt(amount)], GAS.placeBid, BigInt(value || 0n))
  }
  withdraw() { return this.send('withdraw', [], GAS.withdraw) }

  // Host-only. The host wallet is the credential — no shared secret, and no
  // server-side organizer key anywhere in the system.
  startLot(roomId, name, image, duration) {
    return this.send('startLot', [Number(roomId), name, image, Number(duration)], GAS.startLot)
  }
  sellLot(roomId, lotId) { return this.send('sellLot', [Number(roomId), Number(lotId)], GAS.sellLot) }
  closeLot(roomId) { return this.send('closeLot', [Number(roomId)], GAS.closeLot) }
  finalize(roomId, lotId) { return this.send('finalize', [Number(roomId), Number(lotId)], GAS.finalize) }
}

/**
 * Deterministic squad assignment from the wallet address.
 *
 * Letting people choose collapses the social dynamic — if 60 of 70 pick the
 * same squad there is no auction. This is uniform, needs no server state, and
 * is a better moment anyway: "your wallet drafted you to Bangalore Bytes."
 */
export const squadForAddress = (address) => (parseInt(address.slice(-1), 16) % 4) + 1

/** Real-MON escrow: how much this address can withdraw (refunds + host proceeds). */
export async function withdrawableOf(address) {
  if (!CONTRACT || !address) return 0n
  try {
    return await readClient.readContract({
      address: CONTRACT, abi: BIDBLITZ_ABI, functionName: 'pendingWithdrawals', args: [address],
    })
  } catch { return 0n }
}

/**
 * Monad's reserve-balance rule computes an account's inflight gas budget from
 * the execution state 3 blocks back. A wallet that first received MON at block
 * B had zero balance at B-3, so its budget is zero and its first bid is
 * EXCLUDED at consensus — silently, with no receipt and no revert. Wait it out.
 *
 * This still matters even though nobody is airdropped any more: a bidder who
 * tops up from a faucet or an exchange mid-room hits exactly the same window.
 */
export async function waitForArming(fromBlock, blocks = 4) {
  const target = BigInt(fromBlock) + BigInt(blocks)
  for (let i = 0; i < 40; i++) {
    if ((await readClient.getBlockNumber()) >= target) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/**
 * Gas floor for a bidder. Enough for joinSolo + a handful of bids at the padded
 * MAX_FEE, so we can tell someone "you need MON" BEFORE they tap BID and lose a
 * lot to a silently-excluded transaction.
 *
 * Deliberately generous: Monad bills on gas_limit rather than gas used, so the
 * worst case is what has to be affordable, not the average.
 */
export const MIN_GAS_BALANCE = (GAS.joinSolo + GAS.placeBid * 5n) * TYPICAL_GAS_PRICE

/**
 * The host's floor — a whole lot's worth of host transactions (startLot +
 * sellLot) times five lots. Hosts spend far more gas than bidders and, unlike a
 * bidder, a host who runs dry mid-lot strands the whole room.
 */
export const HOST_GAS_FLOOR = (GAS.startLot + GAS.sellLot) * 5n * TYPICAL_GAS_PRICE

/**
 * Watch an address until it can pay for its own gas, then wait out the
 * reserve-balance window. Resolves false if it never arrives.
 *
 * Replaces the old requestFunding() faucet: BidBlitz no longer holds a treasury
 * that pays for other people's transactions. Participants bring their own MON,
 * so the only thing left to do is notice when it lands.
 */
export async function waitForFunds(signer, { timeoutMs = 180_000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const balance = await signer.balance().catch(() => 0n)
    if (balance >= MIN_GAS_BALANCE) {
      await waitForArming(await readClient.getBlockNumber(), 4)
      return true
    }
    onTick?.(balance)
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}
