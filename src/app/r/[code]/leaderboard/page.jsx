'use client'
import { use, useMemo } from 'react'
import Link from 'next/link'
import { BidBlitzMark, MonadLockup } from '../../../../components/Logo'
import { RaceTrack, racersFromState } from '../../../../components/RaceTrack'
import { useParticipants } from '../../../../lib/useParticipants'
import { useAuction, useCountdown } from '../../../../lib/useAuction'
import { roomIdFromCode } from '../../../../lib/room.mjs'
import { TeamStandings } from '../../../../components/TeamStandings'
import { formatAmount, entityLabel } from '../../../../lib/format.mjs'

/**
 * Standalone, read-only leaderboard at its own URL: /r/<CODE>/leaderboard.
 *
 * Open it anywhere — a second laptop, a projector, an OBS browser source — and
 * it shows the live board without the join flow, audio gate, or QR. It reads the
 * same /api/state everything else does, so it works on any device that can load
 * the page. Handy for a demo: point one screen here instead of juggling three.
 */
export default function LeaderboardPage({ params }) {
  const { code } = use(params)
  const roomId = roomIdFromCode(code)
  const { state } = useAuction({ roomId, live: true, intervalMs: 500 })
  const participants = useParticipants(code)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = live && remaining <= 5
  const racers = useMemo(() => racersFromState(state, { participants }), [state, participants])

  return (
    <main className="surface-dark" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 40px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: '-.02em' }}>
            {state?.rname || 'BidBlitz'}
          </span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, color: '#8d85b4', letterSpacing: '.12em' }}>
            {code?.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {live && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, letterSpacing: '.16em', color: '#ff8080' }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: '#ff4d4d', animation: 'bb-bolt 1.4s ease-in-out infinite' }} /> LIVE
            </span>
          )}
          <span className="mono" style={{ fontSize: 15, color: '#8d85b4' }}>
            block #{Number(state?.blockNumber || 0).toLocaleString()}
          </span>
          <MonadLockup height={22} inverted />
        </div>
      </header>

      <section style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 40, padding: '32px 40px', alignItems: 'center' }}>
        {/* current lot */}
        <div>
          {state?.lotId > 0 ? (
            <>
              <div style={{ fontSize: 15, letterSpacing: '.2em', color: '#8d85b4', fontWeight: 700 }}>
                LOT #{state.lotId}{sold ? ' · SOLD' : live ? ' · LIVE' : ''}
              </div>
              {state.limage && (
                <img
                  src={state.limage}
                  alt=""
                  style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 20, margin: '14px 0', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <h1 className="display" style={{ fontSize: 'clamp(40px,5vw,72px)', margin: '10px 0 0', textWrap: 'balance' }}>
                {state.lname}
              </h1>
              <div style={{ fontSize: 15, letterSpacing: '.2em', color: '#8d85b4', fontWeight: 700, marginTop: 18 }}>
                {sold ? 'SOLD FOR' : 'CURRENT BID'}
              </div>
              <div
                className="display"
                style={{ fontSize: 'clamp(64px,9vw,120px)', lineHeight: 1, color: urgent ? '#ff4d4d' : 'var(--monad-purple)', textShadow: '0 0 60px rgba(110,84,255,.4)', textTransform: 'none' }}
              >
                {formatAmount(highest)}<span style={{ fontSize: '.3em', marginLeft: 8 }}>MON</span>
              </div>
              <div style={{ fontSize: 24, color: '#cdc6ee', marginTop: 8 }}>
                {highest === 0n ? 'No bids yet' : <>{entityLabel(state.leadEntity, state?.mode)} <span style={{ color: '#8d85b4' }}>leading</span></>}
                {live && <> · <strong style={{ color: urgent ? '#ff4d4d' : '#fff' }}>{remaining.toFixed(1)}s</strong></>}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <BidBlitzMark size={90} style={{ opacity: 0.35 }} />
              <h1 className="display" style={{ fontSize: 48, marginTop: 22 }}>Standing by</h1>
              <p style={{ color: '#8d85b4', fontSize: 20 }}>Waiting for the first lot.</p>
            </div>
          )}
        </div>

        {/* the board */}
        <div>
          <div style={{ fontSize: 14, letterSpacing: '.2em', color: '#8d85b4', fontWeight: 700, marginBottom: 12 }}>
            {state?.racers?.length ? 'WHO GETS THERE FIRST' : 'STANDINGS'}
          </div>
          {racers.length ? (
            <RaceTrack racers={racers} dark scale={0.9} />
          ) : (
            <p style={{ color: '#8d85b4', fontSize: 18 }}>Bidders appear here as soon as a lot opens.</p>
          )}

          {Number(state?.mode) === 1 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#8d85b4', fontWeight: 700, marginBottom: 10 }}>TEAM STANDINGS</div>
              <TeamStandings squadPurses={state?.squadPurses} leadEntity={state?.leadEntity} dark />
            </div>
          )}
        </div>
      </section>

      <footer style={{ padding: '14px 40px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', color: '#8d85b4', fontSize: 14 }}>
        <span>Live leaderboard · read-only</span>
        <Link href={`/r/${code}`} style={{ color: '#8d85b4' }}>Join this room →</Link>
      </footer>
    </main>
  )
}
