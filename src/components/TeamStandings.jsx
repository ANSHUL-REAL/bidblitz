'use client'
import { Leaderboard } from './Leaderboard'
import { SQUADS, formatAmount } from '../lib/format.mjs'

/**
 * The four fantasy squads ranked by remaining purse, colour-coded, with the
 * FLIP reorder so a team that overtakes slides up. Shared by the room, the big
 * screen, and the standalone leaderboard so on-chain fantasy looks as
 * team-forward as the demo. Purses move on sales, so the shuffle happens at each
 * SOLD.
 */
export function TeamStandings({ squadPurses = [], leadEntity = 0, myEntity = 0, dark = false }) {
  const rows = SQUADS
    .map((s, i) => ({ ...s, purse: BigInt(squadPurses[i] ?? 0) }))
    .sort((a, b) => (b.purse > a.purse ? 1 : -1))
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const rowBg = dark ? '#1c1436' : '#fff'
  const line = dark ? '#2a2050' : '#eeecf7'
  const ink = dark ? '#fff' : '#12121c'

  return (
    <Leaderboard
      items={rows}
      getKey={(r) => r.id}
      dark={dark}
      renderRow={(r) => {
        const leading = Number(leadEntity) === r.id
        const mine = Number(myEntity) === r.id
        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              background: leading ? `${r.color}22` : rowBg, borderRadius: 12,
              border: `1px solid ${leading ? r.color : line}`,
            }}
          >
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: '#9c94bd', width: 16, textAlign: 'right' }}>{r.rank}</span>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: r.color, color: r.ink || '#fff', flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 11 }}>{r.short}</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
              {mine && <span style={{ color: '#6b2de6', fontWeight: 700 }}> · you</span>}
            </span>
            {leading && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: r.color }}>LEADING</span>}
            <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16, color: ink, minWidth: 96, textAlign: 'right' }}>
              {formatAmount(r.purse)} <span style={{ fontSize: 11, color: '#6b2de6' }}>MON</span>
            </span>
          </div>
        )
      }}
    />
  )
}
