import { defineChain } from 'viem'

// Do NOT import viem's exported `monadTestnet` — it ships a stale explorer URL
// (testnet.monadexplorer.com) and a stale blockTime of 400ms. Official docs say
// 300ms blocks / 600ms finality and testnet.monadvision.com.
export const EXPLORER = 'https://testnet.monadvision.com'

export const PUBLIC_RPCS = [
  'https://testnet-rpc.monad.xyz',
  'https://rpc.ankr.com/monad_testnet',
  'https://rpc-testnet.monadinfra.com',
]

// Ordered by preference. A private Alchemy/QuickNode endpoint (MONAD_RPC_URL)
// takes priority — the public endpoint is rate-limited per-IP, and the whole
// venue shares one IP, so every team in the room competes for the same 50rps.
// Read lazily: .env is loaded after this module is imported.
export const rpcUrls = () => [process.env.MONAD_RPC_URL, ...PUBLIC_RPCS].filter(Boolean)

export const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: PUBLIC_RPCS } },
  blockExplorers: { default: { name: 'MonadVision', url: EXPLORER } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 251449,
    },
  },
  testnet: true,
})

// viem's default pollingInterval is 4000ms. On a 600ms-finality chain that makes
// every confirmation feel broken. 250ms is under one block time.
export const POLLING_INTERVAL = 250

// --- Gas ---------------------------------------------------------------------
// Monad bills on gas_limit, NOT gas used, and bills reverted transactions too.
// So `gas` must be tight. maxFeePerGas is different: EIP-1559 refunds the delta,
// so padding it is free insurance against a base-fee bump. Do not conflate them.
export const MAX_PRIORITY_FEE = 2_000_000_000n // 2 gwei — matches the hardcoded RPC value
export const MAX_FEE = 200_000_000_000n // 200 gwei — padded, refunded if unused

// Tight limits. Replace with measured `estimateGas` values +2% once deployed.
export const GAS = {
  transfer: 21_000n,
  createRoom: 260_000n, // writes 4 squad purses + the room record
  joinSquad: 70_000n,
  joinSolo: 105_000n,
  placeBid: 120_000n,   // covers the escrow path's refund SSTORE + Refunded event
  startLot: 130_000n,
  sellLot: 175_000n,    // includes the badge mint and its label
  closeLot: 80_000n,    // escrow close also refunds the current leader
  withdraw: 60_000n,    // zero one slot + a value transfer to an EOA
  finalize: 190_000n,   // permissionless settle after expiry (incl. badge mint)
}

export const feeParams = () => ({
  maxFeePerGas: MAX_FEE,
  maxPriorityFeePerGas: MAX_PRIORITY_FEE,
})

export const txUrl = (hash) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (a) => `${EXPLORER}/address/${a}`
