/**
 * Display units.
 *
 * Purses are accounting only — no MON moves on settlement — so amounts are
 * denominated to read like the Hero design ("12.34 MON"), not "0.001". Only
 * gas is ever real MON.
 */
export const MON = 10n ** 18n

export const MIN_INCREMENT = MON / 2n // 0.5 MON
export const QUICK_INCREMENTS = [5n, 10n, 20n, 50n].map((n) => (n * MON) / 10n) // .5, 1, 2, 5

export const toMon = (wei) => Number(BigInt(wei ?? 0n)) / 1e18

/** "12.34" — two decimals, matching the design's racer readout. */
export function formatAmount(wei) {
  const v = toMon(wei)
  if (v === 0) return '0.00'
  if (v >= 1000) return v.toFixed(0)
  return v.toFixed(2)
}

/** "12.34 MON" */
export const formatMon = (wei) => `${formatAmount(wei)} MON`

export const incrementLabel = (wei) => {
  const v = toMon(wei)
  return v % 1 === 0 ? `+${v}` : `+${v.toFixed(1)}`
}

export const shortAddress = (a) => (a ? `${a.slice(0, 4)}..${a.slice(-2).toUpperCase()}` : '')

/**
 * Squad colours from Monad's official secondary palette, so four distinct team
 * identities stay on-brand. Guidelines are explicit that purple stays dominant.
 */
export const SQUADS = [
  { id: 1, name: 'Chennai Super Kings', short: 'CSK', color: '#f4c430', ink: '#1a1400' },
  { id: 2, name: 'Mumbai Indians', short: 'MI', color: '#1f6bd0', ink: '#ffffff' },
  { id: 3, name: 'Royal Challengers', short: 'RCB', color: '#d1202f', ink: '#ffffff' },
  { id: 4, name: 'Kolkata Knight Riders', short: 'KKR', color: '#6a3fa0', ink: '#ffffff' },
]

export const squadOf = (id) => SQUADS.find((s) => s.id === Number(id))
export const isSolo = (entityId) => Number(entityId) > SQUADS.length

/** Distinct, deterministic colours for solo bidders (entity ids start at 1). */
export const SOLO_COLORS = ['#6b2de6', '#12703a', '#d1202f', '#1f6bd0', '#f4c430', '#e67e22', '#0ea5e9', '#a0439a']

/**
 * Label an entity for display. MODE MATTERS: in a fantasy room (mode 1) entity
 * ids 1..4 are the IPL squads; in a solo/meme auction (mode 0) those same ids
 * are just the first bidders, so calling squadOf on them would print "Chennai
 * Super Kings leading" on a meme lot. Always pass the room mode.
 */
export function entityLabel(entityId, mode) {
  const id = Number(entityId)
  if (!id) return '—'
  if (Number(mode) === 1) return squadOf(id)?.name ?? `Team ${id}`
  return `Bidder #${id}`
}

/** Accent colour for an entity, mode-aware for the same reason as entityLabel. */
export function entityColor(entityId, mode) {
  const id = Number(entityId)
  if (!id) return '#6b2de6'
  if (Number(mode) === 1) return squadOf(id)?.color || '#6b2de6'
  return SOLO_COLORS[(id - 1) % SOLO_COLORS.length]
}
