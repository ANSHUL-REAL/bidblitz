import { createPublicClient, createWalletClient, http, fallback } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monad, rpcUrls, POLLING_INTERVAL } from './chain.mjs'
import { BIDBLITZ_ABI } from './abi.mjs'

export { BIDBLITZ_ABI }

export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT

// rank:false preserves ordering (private endpoint first) rather than letting
// viem re-rank onto the public node the whole venue is already saturating.
export const transport = fallback(
  rpcUrls().map((url) => http(url, { timeout: 8_000, retryCount: 2 })),
  { rank: false },
)

export const publicClient = createPublicClient({
  chain: monad,
  transport,
  pollingInterval: POLLING_INTERVAL,
})

export const relayerKeys = () =>
  (process.env.RELAYER_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean)

export const relayerWallet = (key) =>
  createWalletClient({ account: privateKeyToAccount(key), chain: monad, transport })

/**
 * Deterministic relayer assignment. Stateless-safe across Vercel instances, and
 * a retry always lands on the same relayer whose nonce sequence it already
 * advanced — which round-robin would not guarantee.
 */
export const relayerIndexFor = (address, count) =>
  parseInt(address.slice(-2), 16) % count

/** BigInt is not JSON-serialisable; the whole payload crosses the wire as strings. */
export const jsonSafe = (v) => {
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return v.map(jsonSafe)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  }
  return v
}
