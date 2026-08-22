import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

export const redis = url && token ? new Redis({ url, token }) : null
export const hasRedis = Boolean(redis)

/**
 * Degraded fallback so local dev works before Upstash is wired up.
 *
 * This is NOT safe under concurrency: two lambdas can read the same nonce, both
 * get a 200 from eth_sendRawTransaction, and one silently evaporates (Monad has
 * no global mempool, so the loser fails the nonce check at a leader and
 * disappears with no receipt). Fine for one phone; broken for twenty.
 */
export const inMemory = new Map()

export async function acquireLock(key, ttlSeconds = 60) {
  if (redis) return (await redis.set(key, 1, { nx: true, ex: ttlSeconds })) !== null
  if (inMemory.has(key) && inMemory.get(key) > Date.now()) return false
  inMemory.set(key, Date.now() + ttlSeconds * 1000)
  return true
}

export async function releaseLock(key) {
  if (redis) return void (await redis.del(key))
  inMemory.delete(key)
}

/** Atomic nonce allocation. Relayers are fresh wallets, so they start at 0. */
export async function nextNonce(idx) {
  if (redis) return Number(await redis.incr(`nonce:${idx}`)) - 1
  const k = `nonce:${idx}`
  const n = inMemory.get(k) ?? 0
  inMemory.set(k, n + 1)
  return n
}

export async function resetNonce(idx, value) {
  if (redis) return void (await redis.set(`nonce:${idx}`, value))
  inMemory.set(`nonce:${idx}`, value)
}
