'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BidBlitzMark } from '../../../../components/Logo'
import { RaceTrack, racersFromState } from '../../../../components/RaceTrack'
import { useCountdown } from '../../../../lib/useAuction'
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
        minHeight: '100dvh', background: '#0d0b16', color: '#fff',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        display: 'flex', flexDirection: 'column',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 34px' }}>
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
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#7ee2a8', background: 'rgba(126,226,168,.14)', padding: '3px 9px', borderRadius: 999 }}>
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

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '0 34px 34px' }}>
        {!state?.lotId ? (
          <JoinSplash code={code} />
        ) : (
          <div style={{ width: '100%', maxWidth: 1400, textAlign: 'center' }}>
            <div style={{ fontSize: 15, letterSpacing: '.28em', color: '#8a83a8', fontWeight: 700 }}>
              LOT #{state.lotId}{sold ? ' · SOLD' : live ? ' · LIVE' : ''}
            </div>

            {state.limage && (
              <img
                src={state.limage}
                alt=""
                style={{
                  width: 200, height: 200, objectFit: 'cover', borderRadius: 26, margin: '18px auto 0',
                  boxShadow: '0 30px 90px rgba(0,0,0,.5)', display: 'block',
                }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}

            <h1
              style={{
                fontFamily: "'Archivo',sans-serif", fontWeight: 900, letterSpacing: '-.04em',
                textTransform: 'uppercase', fontSize: 'clamp(44px,7vw,104px)', margin: '16px 0 0',
                lineHeight: .92, textWrap: 'balance',
              }}
            >
              {state.lname}
            </h1>

            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, letterSpacing: '.28em', color: '#8a83a8', fontWeight: 700 }}>
                {sold ? 'SOLD FOR' : 'CURRENT BID'}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, lineHeight: 1,
                  fontSize: 'clamp(80px,15vw,220px)', letterSpacing: '-.05em',
                  color: urgent ? '#ff5d5d' : sold ? '#7ee2a8' : '#b9a6ff',
                  transition: 'color .3s ease',
                }}
              >
                {formatAmount(highest)}
                <span style={{ fontSize: '.26em', marginLeft: 14, color: '#8a83a8' }}>PTS</span>
              </div>

              <div style={{ fontSize: 26, marginTop: 10, color: '#e5e0f5' }}>
                {sold
                  ? winnerName ? <><strong>{winnerName}</strong> takes it</> : 'Nobody bid'
                  : highest === 0n
                    ? 'No bids yet'
                    : <><strong>{winnerName}</strong> leading</>}
              </div>

              {live && (
                <div
                  style={{
                    fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 64,
                    color: urgent ? '#ff5d5d' : '#fff', marginTop: 10,
                  }}
                >
                  {remaining}s
                </div>
              )}
            </div>

            {racers.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <RaceTrack racers={racers} dark />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
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
          style={{ width: 'min(46vh,440px)', height: 'min(46vh,440px)', borderRadius: 24, margin: '22px 0 0', background: '#fff', padding: 14 }}
        />
      )}
      <div
        style={{
          fontFamily: "'DM Mono',monospace", fontWeight: 700,
          fontSize: 'clamp(56px,9vw,128px)', letterSpacing: '.22em',
          margin: '18px 0 0', color: '#b9a6ff',
        }}
      >
        {code}
      </div>
      <p style={{ fontSize: 22, color: '#8a83a8', margin: '10px 0 0' }}>
        Pick a name and a face. That&apos;s it — no wallet, no MON, nothing to lose.
      </p>
    </div>
  )
}
