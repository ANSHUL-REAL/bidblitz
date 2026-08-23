import { createPublicClient, http, fallback } from 'viem'
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

/**
 * There is deliberately no wallet on the server.
 *
 * BidBlitz used to run an 8-relayer pool that airdropped MON to every joiner
 * out of a MASTER_KEY treasury. That made the platform pay for strangers' gas,
 * and since /api/fund had no auth it was an open faucet the moment the URL went
 * public. Participants now bring their own MON, so no server-held key can spend
 * anything — the only key left in the repo is the deploy script's, used once.
 */

/** BigInt is not JSON-serialisable; the whole payload crosses the wire as strings. */
export const jsonSafe = (v) => {
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return v.map(jsonSafe)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  }
  return v
}
