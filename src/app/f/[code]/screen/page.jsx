'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BidBlitzMark } from '../../../../components/Logo'
import { RaceTrack, racersFromState } from '../../../../components/RaceTrack'
import { useCountdown, formatCountdown } from '../../../../lib/useAuction'
import { useFreeState } from '../../../../lib/useFreeRoom'
import { normalizeCode } from '../../../../lib/freeRoom.mjs'
import { formatAmount, entityLabel } from '../../../../lib/format.mjs'

/**
 * The projector view for a FREE room.
 *
 * Read from across a room, so everything is oversized and there is exactly one
 * thing to look at per phase: the QR before the auction starts, the price while
 * a lot is live, the winner when it sells.
 *
 * Polls faster than the phones do (400ms) because this is the shared clock
 * everyone in the room is actually watching — if the big number lags, the whole
 * auction feels broken even when every phone is correct.
 */
export default function FreeScreen({ params }) {
  const { code: raw } = use(params)
  const code = normalizeCode(raw)
  const { state } = useFreeState({ code, live: true, intervalMs: 400 })

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const isOpen = Number(state?.openLotId || 0) !== 0
  const live = isOpen && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = live && remaining <= 5

  const participants = useMemo(() => {
    const map = new Map()
    for (const p of state?.players ?? []) {
      map.set(p.addr.toLowerCase(), { name: p.name, avatar_seed: p.avatarSeed })
    }
    return map
  }, [state?.players])

  const racers = useMemo(() => racersFromState(state, { participants }), [state, participants])
  const winnerName = state?.bidder
    ? participants.get(state.bidder.toLowerCase())?.name || entityLabel(state.leadEntity, state?.mode)
    : null

  return (
    <main
      style={{
        minHeight: '100dvh', overflowY: 'auto', background: '#0d0b16', color: '#fff',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        display: 'flex', flexDirection: 'column',
      }}
    >
      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'clamp(10px,1.8vh,22px) 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BidBlitzMark size={40} />
          <div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: '-.02em' }}>
              {state?.rname || 'BidBlitz'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, color: '#b9a6ff', letterSpacing: '.2em' }}>
                {code}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#b9a6ff', background: 'rgba(185,166,255,.16)', padding: '3px 9px', borderRadius: 999 }}>
                FREE · NO WALLET
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#8a83a8', fontWeight: 700 }}>IN THE ROOM</div>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 34 }}>
            {state?.nEntities ?? 0}
          </div>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 34px clamp(12px,2.5vh,34px)' }}>
        {state?.closed ? (
          <FinalBoard state={state} />
        ) : !state?.lotId ? (
          <JoinSplash code={code} />
        ) : (
          <div style={{ width: '100%', maxWidth: 1400, textAlign: 'center', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}>
            <div style={{ fontSize: 15, letterSpacing: '.28em', color: '#8a83a8', fontWeight: 700 }}>
              LOT #{state.lotId}{sold ? ' · SOLD' : live ? ' · LIVE' : ''}
            </div>

            {state.limage && (
              <img
                src={state.limage}
                alt=""
                style={{
                  width: 'clamp(80px,14vh,200px)', height: 'clamp(80px,14vh,200px)', objectFit: 'cover',
                  borderRadius: 26, margin: 'clamp(6px,1.5vh,18px) auto 0', flexShrink: 0,
                  boxShadow: '0 30px 90px rgba(0,0,0,.5)', display: 'block',
                }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}

            <h1
              style={{
                fontFamily: "'Archivo',sans-serif", fontWeight: 900, letterSpacing: '-.04em',
                textTransform: 'uppercase', fontSize: 'clamp(32px,min(7vw,7vh),104px)',
                margin: 'clamp(6px,1.4vh,16px) 0 0', lineHeight: .92, textWrap: 'balance', flexShrink: 0,
              }}
            >
              {state.lname}
            </h1>

            <div style={{ marginTop: 'clamp(6px,1.6vh,20px)', flexShrink: 0 }}>
              <div style={{ fontSize: 14, letterSpacing: '.28em', color: '#8a83a8', fontWeight: 700 }}>
                {sold ? 'SOLD FOR' : 'CURRENT BID'}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, lineHeight: 1,
                  fontSize: 'clamp(52px,min(15vw,17vh),220px)', letterSpacing: '-.05em',
                  color: urgent ? '#ff5d5d' : sold ? '#b9a6ff' : '#b9a6ff',
                  transition: 'color .3s ease',
                }}
              >
                {formatAmount(highest)}
                <span style={{ fontSize: '.26em', marginLeft: 14, color: '#8a83a8' }}>PTS</span>
              </div>

              <div style={{ fontSize: 'clamp(16px,2.4vh,26px)', marginTop: 'clamp(4px,1vh,10px)', color: '#e5e0f5' }}>
                {sold
                  ? winnerName
                    ? (
                        <span
                          style={{
                            display: 'inline-block', padding: 'clamp(7px,1.4vh,12px) clamp(14px,2vw,24px)',
                            borderRadius: 999, background: 'rgba(185,166,255,.16)',
                            fontSize: 'clamp(17px,2.8vh,30px)', fontWeight: 700, color: '#b9a6ff',
                          }}
                        >
                          🎉 Congratulations <strong style={{ color: '#fff' }}>{winnerName}</strong> — {state.lname} is yours
                        </span>
                      )
                    : 'Nobody bid'
                  : highest === 0n
                    ? 'No bids yet'
                    : <><strong>{winnerName}</strong> leading</>}
              </div>

              {live && (
                <div
                  style={{
                    fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 'clamp(34px,6vh,64px)',
                    color: urgent ? '#ff5d5d' : '#fff', marginTop: 'clamp(2px,.8vh,10px)',
                  }}
                >
                  {formatCountdown(remaining)}s
                </div>
              )}
            </div>

            {racers.length > 0 && (
              <div style={{ marginTop: 'clamp(10px,2.4vh,30px)', minHeight: 0, overflow: 'hidden', flexShrink: 1 }}>
                <RaceTrack racers={racers} dark unit="PTS" />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

/** The result, sized for the back of the room. */
function FinalBoard({ state }) {
  const players = [...(state?.players ?? [])].sort(
    (a, b) => (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1),
  )
  const champ = players[0]

  return (
    <div style={{ width: '100%', maxWidth: 900, textAlign: 'center', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}>
      <div style={{ fontSize: 15, letterSpacing: '.3em', color: '#8a83a8', fontWeight: 700, flexShrink: 0 }}>
        AUCTION ENDED
      </div>
      {champ && champ.wins > 0 ? (
        <h1
          style={{
            fontFamily: "'Archivo',sans-serif", fontWeight: 900, letterSpacing: '-.04em',
            textTransform: 'uppercase', fontSize: 'clamp(32px,min(8vw,9vh),120px)',
            margin: 'clamp(6px,1.4vh,14px) 0 0', lineHeight: .92, flexShrink: 0,
          }}
        >
          {champ.name || `Bidder ${champ.entityId}`}
          <span style={{ display: 'block', fontSize: '.28em', color: '#b9a6ff', letterSpacing: '-.01em', marginTop: 10 }}>
            {champ.wins} lot{champ.wins === 1 ? '' : 's'} won
          </span>
        </h1>
      ) : (
        <p style={{ fontSize: 30, color: '#8a83a8', marginTop: 20 }}>No lots were sold.</p>
      )}

      <div
        style={{
          marginTop: 'clamp(12px,3vh,34px)', display: 'grid', gap: 8, textAlign: 'left',
          minHeight: 0, overflowY: 'auto', flexShrink: 1,
        }}
      >
        {players.slice(0, 10).map((p, i) => (
          <div
            key={p.addr}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, borderRadius: 14, flexShrink: 0,
              padding: 'clamp(7px,1.3vh,12px) 18px',
              background: i === 0 ? 'rgba(185,166,255,.14)' : 'rgba(255,255,255,.04)',
            }}
          >
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 'clamp(14px,2.2vh,20px)', color: '#8a83a8', width: 34 }}>{i + 1}</span>
            <span style={{ fontSize: 'clamp(16px,2.8vh,24px)', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name || `Bidder ${p.entityId}`}
            </span>
            <span style={{ fontSize: 'clamp(13px,2.1vh,19px)', color: '#8a83a8' }}>{formatAmount(p.spent)} spent</span>
            <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 'clamp(20px,3.4vh,30px)', color: p.wins ? '#b9a6ff' : '#4a4560', width: 46, textAlign: 'right' }}>
              {p.wins}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Before the first lot the screen has exactly one job: get people in. */
function JoinSplash({ code }) {
  const [qr, setQr] = useState(null)
  const target = useRef('')

  useEffect(() => {
    target.current = `${window.location.origin}/f/${code}`
    QRCode.toDataURL(target.current, {
      width: 900, margin: 1,
      color: { dark: '#0d0b16', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => {})
  }, [code])

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, letterSpacing: '.3em', color: '#8a83a8', fontWeight: 700 }}>
        SCAN TO JOIN — FREE, NO WALLET
      </div>
      {qr && (
        <img
          src={qr}
          alt=""
          style={{ width: 'min(40vh,440px)', height: 'min(40vh,440px)', borderRadius: 24, margin: 'clamp(10px,2.4vh,22px) 0 0', background: '#fff', padding: 14 }}
        />
      )}
      <div
        style={{
          fontFamily: "'DM Mono',monospace", fontWeight: 700,
          fontSize: 'clamp(38px,min(9vw,10vh),128px)', letterSpacing: '.22em',
          margin: 'clamp(6px,1.6vh,18px) 0 0', color: '#b9a6ff',
        }}
      >
        {code}
      </div>
      <p style={{ fontSize: 'clamp(15px,2.4vh,22px)', color: '#8a83a8', margin: 'clamp(4px,1vh,10px) 0 0' }}>
        Pick a name and a face. That&apos;s it — no wallet, no MON, nothing to lose.
      </p>
    </div>
  )
}
