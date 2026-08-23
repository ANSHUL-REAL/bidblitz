import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

export const redis = url && token ? new Redis({ url, token }) : null
export const hasRedis = Boolean(redis)

/**
 * Degraded fallback so local dev works before Upstash is wired up.
 *
 * This is NOT safe under concurrency — it is per-lambda-instance, so two
 * instances never see each other's locks. Fine for one laptop; do not rely on
 * it to rate-limit anything in production.
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

/**
 * Fixed-window counter, for rate-limiting free-mode writes (which cost no gas
 * and so have no natural cost ceiling of their own).
 * Returns the count after this hit.
 */
export async function bump(key, windowSeconds = 60) {
  if (redis) {
    const n = Number(await redis.incr(key))
    if (n === 1) await redis.expire(key, windowSeconds)
    return n
  }
  const now = Date.now()
  const slot = inMemory.get(key)
  if (!slot || slot.until < now) {
    inMemory.set(key, { n: 1, until: now + windowSeconds * 1000 })
    return 1
  }
  slot.n += 1
  return slot.n
}
