/**
 * Bids are tiny real MON amounts rendered as IPL-style rupee crore.
 * Pure display — the chain underneath is real. 0.001 MON = Rs 1 Cr.
 *
 * This costs nothing and is most of why the big screen reads as a broadcast
 * rather than a block explorer.
 */
export const CRORE = 10n ** 15n // 0.001 MON

export const MIN_INCREMENT = CRORE // Rs 1 Cr
export const QUICK_INCREMENTS = [1n, 2n, 5n, 10n].map((n) => n * CRORE)

export const toCrore = (wei) => Number(BigInt(wei ?? 0n)) / Number(CRORE)

export function formatCrore(wei) {
  const cr = toCrore(wei)
  if (cr === 0) return '₹0'
  return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)} Cr`
}

export const formatMon = (wei) => `${(Number(BigInt(wei ?? 0n)) / 1e18).toFixed(4)} MON`

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * Squad colours come from Monad's official secondary palette (Orange, Purple,
 * Cyan, Pink) so four distinct team identities stay on-brand. Guidelines are
 * explicit that purple must remain dominant — hence it anchors the set.
 */
export const SQUADS = [
  { id: 1, name: 'Hyderabad Hashers', short: 'HYH', color: '#ffae45' },
  { id: 2, name: 'Monad Mavericks', short: 'MOM', color: '#6e54ff' },
  { id: 3, name: 'Chennai Compilers', short: 'CHC', color: '#85e6ff' },
  { id: 4, name: 'Bangalore Bytes', short: 'BLR', color: '#ff8ee4' },
]

export const squadOf = (id) => SQUADS.find((s) => s.id === Number(id))

/** Solo entities are everything past the squads. */
export const isSolo = (entityId) => Number(entityId) > SQUADS.length

export function entityLabel(entityId, soloNames = {}) {
  const id = Number(entityId)
  if (!id) return '—'
  const squad = squadOf(id)
  if (squad) return squad.name
  return soloNames[id] || `Solo #${id - SQUADS.length}`
}
