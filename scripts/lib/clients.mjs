import { createPublicClient, createWalletClient, http, fallback } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monad, rpcUrls, POLLING_INTERVAL } from '../../src/lib/chain.mjs'
import { loadEnv } from './env.mjs'

loadEnv()

// rank:false keeps the ordering above (private endpoint first) instead of
// letting viem re-rank by latency onto the shared public node.
export const transport = fallback(
  rpcUrls().map((url) => http(url, { timeout: 8_000, retryCount: 2 })),
  { rank: false },
)

export const publicClient = createPublicClient({
  chain: monad,
  transport,
  pollingInterval: POLLING_INTERVAL,
})

export const accountFor = (key) => privateKeyToAccount(key)

export const walletFor = (key) =>
  createWalletClient({
    account: privateKeyToAccount(key),
    chain: monad,
    transport,
    pollingInterval: POLLING_INTERVAL,
  })

export const fmt = (wei) => `${(Number(wei) / 1e18).toFixed(4)} MON`
