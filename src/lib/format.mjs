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
  { id: 1, name: 'Hyderabad Hashers', short: 'HYH', color: '#ffae45' },
  { id: 2, name: 'Monad Mavericks', short: 'MOM', color: '#6b2de6' },
  { id: 3, name: 'Chennai Compilers', short: 'CHC', color: '#85e6ff' },
  { id: 4, name: 'Bangalore Bytes', short: 'BLR', color: '#ff8ee4' },
]

export const squadOf = (id) => SQUADS.find((s) => s.id === Number(id))
export const isSolo = (entityId) => Number(entityId) > SQUADS.length

export function entityLabel(entityId) {
  const id = Number(entityId)
  if (!id) return '—'
  return squadOf(id)?.name ?? `Solo #${id - SQUADS.length}`
}
