import { keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * name + password -> a deterministic burner wallet.
 *
 * This IS the recovery mechanism: retyping the same name and password on any
 * device regenerates the same address. There is no backend user table.
 *
 * SECURITY, stated plainly: the salt must ship to the browser to derive the key,
 * so it is public. Anyone who knows a name and guesses the password can derive
 * that key. For a testnet party game where the worst case is bidding from
 * someone's purse, that is acceptable — but it is why we require a password
 * rather than a 4-digit PIN, and why the UI says never to reuse it.
 */

// Aggressive normalisation: two people typing "Rahul " and "rahul" must land on
// the same wallet deliberately, not by accident, so the collision check at join
// can catch them.
export const normalizeName = (n) =>
  (n ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)

export const SALT = process.env.NEXT_PUBLIC_EVENT_SALT || 'bidblitz-hyd-v3'

export function deriveKey(name, password, salt = SALT) {
  const normalized = normalizeName(name)
  if (!normalized || !password) throw new Error('name and password required')
  return keccak256(toHex(`bidblitz|${salt}|${normalized}|${password}`))
}

export function deriveAccount(name, password, salt = SALT) {
  const key = deriveKey(name, password, salt)
  return { key, account: privateKeyToAccount(key) }
}

export function deriveAddress(name, password, salt = SALT) {
  return deriveAccount(name, password, salt).account.address
}

// --- local cache so a returning phone skips straight to bidding --------------
const STORAGE_KEY = 'bidblitz:identity'

export function saveIdentity({ name, key, address }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, key, address }))
  } catch {}
}

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearIdentity() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
