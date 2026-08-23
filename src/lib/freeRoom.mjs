/**
 * FREE rooms — the off-chain, costs-nobody-anything format.
 *
 * A free room is a real multiplayer auction with real strangers bidding against
 * each other in real time. What it is not is on-chain: no wallet, no MON, no
 * gas, no transaction. On Monad even a play-money bid costs gas, so anything
 * genuinely free has to live off the chain — otherwise somebody is paying, and
 * BidBlitz stopped paying for other people.
 *
 * Everything here is shared between the browser and /api/free/*.
 */

/** Units. The DB stores milli-points; the API speaks 18-decimal wei so the
 *  bidding UI can render free and paid rooms with the same components. */
export const MILLI = 1000n
export const WEI_PER_MILLI = 10n ** 15n

export const milliToWei = (m) => (BigInt(m ?? 0) * WEI_PER_MILLI).toString()
export const weiToMilli = (w) => BigInt(w ?? 0n) / WEI_PER_MILLI

/** Starting purse, mirroring the contract's SOLO_START of 50. */
export const START_PURSE_MILLI = 50n * MILLI
// Fantasy squads don't get a separate pot: every player gets the same purse and
// a squad's total is the sum of its members', so a bigger team is a richer team.
export const MAX_DURATION = 300
export const DEFAULT_DURATION = 20

/** Free rooms live at /f/<code>, a separate namespace from on-chain /r/<code>,
 *  so a free code can never be mistaken for a chain roomId (or collide with one). */
export const freeUrl = (code) => `/f/${String(code || '').toUpperCase()}`

/**
 * Six digits, all numeric.
 *
 * Numeric because these get read off a projector and typed by a stranger in a
 * hurry: a phone shows a number pad instead of a keyboard, and there is no
 * O-versus-0 or I-versus-1 to misread. Six of them is a million codes, which
 * keeps collisions rare enough that the insert retry below effectively never
 * fires twice.
 */
export const CODE_LENGTH = 6

export function makeRoomCode(random = cryptoRandom) {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += String(random(10))
  return out
}

// Accepts 4-6 so rooms created before codes went numeric still resolve.
export const normalizeCode = (c) =>
  String(c ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)

export const isValidCode = (c) => /^[A-Z0-9]{4,6}$/.test(normalizeCode(c))

function cryptoRandom(n) {
  const g = globalThis.crypto
  if (g?.getRandomValues) {
    const a = new Uint32Array(1)
    // Reject the unfair tail so codes stay uniform — cheap, and a biased code
    // space is a collision generator.
    const limit = Math.floor(0xffffffff / n) * n
    do { g.getRandomValues(a) } while (a[0] >= limit)
    return a[0] % n
  }
  return Math.floor(Math.random() * n)
}

/**
 * A player id: address-shaped so the leaderboard, race track and avatar
 * components (all written against addresses) work without a fork, but it is not
 * a wallet — no key exists and it never touches a chain.
 */
export function makePlayerId() {
  const bytes = new Uint8Array(20)
  const g = globalThis.crypto
  if (g?.getRandomValues) g.getRandomValues(bytes)
  else for (let i = 0; i < 20; i++) bytes[i] = Math.floor(Math.random() * 256)
  return '0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const isPlayerId = (v) => /^0x[0-9a-fA-F]{40}$/.test(String(v ?? ''))

/**
 * A player's bidding credential.
 *
 * /api/free/state has to publish every player's id so the leaderboard, race
 * track and avatars can render — which meant the id could not also be the proof
 * of who was bidding, or anyone could read a rival's off the wire and bid as
 * them. This is the proof instead: kept in the browser, only its hash stored.
 */
export function makePlayerSecret() {
  const bytes = new Uint8Array(32)
  const g = globalThis.crypto
  if (g?.getRandomValues) g.getRandomValues(bytes)
  else for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A host's room credential. Kept in their browser; only its hash is stored. */
export function makeHostToken() {
  const bytes = new Uint8Array(32)
  const g = globalThis.crypto
  if (g?.getRandomValues) g.getRandomValues(bytes)
  else for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Web Crypto is available in the browser and in the Node runtime we deploy to. */
export async function hashToken(token) {
  const data = new TextEncoder().encode(`bidblitz-free|${token}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Strip control characters (they wreck the big screen) and clamp the length. */
export const sanitizeText = (s, max = 60) =>
  String(s ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, max)

// --- host token storage (browser) -------------------------------------------
const tokenKey = (code) => `bidblitz:free-host:${code}`
const playerKey = (code) => `bidblitz:free-player:${code}`

export function saveHostToken(code, token) {
  try { localStorage.setItem(tokenKey(code), token) } catch {}
}
export function loadHostToken(code) {
  try { return localStorage.getItem(tokenKey(code)) } catch { return null }
}
export function savePlayer(code, player) {
  try { localStorage.setItem(playerKey(code), JSON.stringify(player)) } catch {}
}
export function loadPlayer(code) {
  try {
    const raw = localStorage.getItem(playerKey(code))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
export function clearPlayer(code) {
  try { localStorage.removeItem(playerKey(code)) } catch {}
}
