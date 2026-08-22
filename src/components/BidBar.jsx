'use client'
import { useEffect, useRef, useState } from 'react'
import { useCountdown } from '../lib/useAuction'
import { formatAmount, formatMon, incrementLabel, QUICK_INCREMENTS, entityLabel, entityColor } from '../lib/format.mjs'

/**
 * The bidding surface: pinned to the bottom of the viewport for as long as a lot
 * is live.
 *
 * A twenty-second lot does not survive the user having to scroll to find the
 * buttons, so this follows them down the page and sizes for a thumb. Everything
 * here is in service of two questions a bidder asks constantly: am I winning,
 * and how long have I got?
 */
export function BidBar({ state, signer, me, refreshMe, roomId }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const purse = BigInt(me?.purse || 0)
  const paddleColor = entityColor(me?.entityId, state?.mode)

  const leading = state?.bidder && signer?.address &&
    state.bidder.toLowerCase() === signer.address.toLowerCase()

  const [pending, setPending] = useState(false)
  const [flash, setFlash] = useState(null)
  const lockedUntil = useRef(0)
  const wasLeading = useRef(false)
  const refreshTimer = useRef(null)

  // The post-bid refresh is a timer; clear it if the room unmounts first.
  useEffect(() => () => clearTimeout(refreshTimer.current), [])

  // "You've been outbid" only fires on the transition, never on first paint.
  useEffect(() => {
    if (wasLeading.current && !leading && live && highest > 0n) {
      setFlash({ kind: 'outbid', text: 'Outbid — go again' })
      navigator.vibrate?.([20, 60, 20])
    }
    wasLeading.current = leading
  }, [leading, live, highest])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 2400)
    return () => clearTimeout(id)
  }, [flash])

  if (!signer || (!live && !sold)) return null

  const nextBid = (inc) => highest + inc
  const urgent = remaining <= 5

  async function bid(inc) {
    const now = Date.now()
    if (pending || now < lockedUntil.current || !live) return
    lockedUntil.current = now + 400 // a double-tap must not become two paid transactions

    const amount = nextBid(inc)

    // `amount` is always highest+inc, so it can't be <= the highest we rendered;
    // the real staleness (someone outbid us since the last ~1s poll) is caught by
    // the contract's strict `>` check, which reverts, and by the outbid banner.
    // What we CAN cheaply prevent here is spending past our own purse.
    if (amount > purse) return setFlash({ kind: 'stale', text: 'Not enough purse left' })

    setPending(true)
    setFlash(null)
    try {
      navigator.vibrate?.(30)
      await signer.placeBid(roomId, state.lotId, amount)
      setFlash({ kind: 'sent', text: `${formatMon(amount)} — sent` })
    } catch (err) {
      await signer.syncNonce().catch(() => {})
      setFlash({ kind: 'error', text: String(err?.message || err).slice(0, 80) })
    } finally {
      setPending(false)
      refreshTimer.current = setTimeout(refreshMe, 800)
    }
  }

  const statusColor = sold ? '#12121c' : leading ? '#12703a' : urgent ? '#ff4d4d' : '#6b2de6'

  return (
    <>
      {/* Reserve page space so the bar never covers the footer. */}
      <div style={{ height: 'var(--bidbar-h, 172px)' }} aria-hidden="true" />

      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: '#fff', borderTop: `3px solid ${statusColor}`,
          boxShadow: '0 -8px 40px rgba(30,20,70,.16)',
          transition: 'border-color .3s ease',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* timer runs the full width — readable from the corner of your eye */}
        <div style={{ height: 5, background: '#eeecf7', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', width: `${Math.min(100, (remaining / 20) * 100)}%`,
              background: urgent ? '#ff4d4d' : '#6b2de6',
              transition: 'width .1s linear, background .3s ease',
            }}
          />
        </div>

        <div className="bidbar-inner">
          {/* ---- what's on the block ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {state?.limage && (
              <img
                src={state.limage}
                alt=""
                style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>
                LOT #{state?.lotId}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 19,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {state?.lname}
              </div>
            </div>
          </div>

          {/* ---- where the bidding is ---- */}
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>
              {sold ? 'SOLD FOR' : 'CURRENT BID'}
            </div>
            <div
              style={{
                fontFamily: "'Archivo', sans-serif", fontWeight: 900, lineHeight: 1,
                fontSize: 34, letterSpacing: '-.03em', color: statusColor,
                transition: 'color .3s ease',
              }}
            >
              {formatAmount(highest)}
              <span style={{ fontSize: 14, marginLeft: 6, color: '#6b2de6' }}>MON</span>
            </div>
            <div style={{ fontSize: 13, color: leading ? '#12703a' : '#6b6d78', fontWeight: leading ? 700 : 400 }}>
              {sold
                ? leading ? 'You won it' : `${entityLabel(state.leadEntity, state?.mode)} won`
                : highest === 0n
                  ? 'No bids yet'
                  : leading
                    ? "You're winning"
                    : `${entityLabel(state.leadEntity, state?.mode)} leading`}
            </div>
          </div>

          {/* ---- your paddle ---- */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, marginBottom: 6,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, transform: 'rotate(45deg)', background: paddleColor }} />
                {entityLabel(me?.entityId, state?.mode)}
              </span>
              <span style={{ fontSize: 13, color: '#6b6d78' }}>
                purse <strong style={{ color: '#12121c' }}>{formatAmount(purse)}</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {QUICK_INCREMENTS.map((inc) => {
                const amount = nextBid(inc)
                const afford = amount <= purse
                const disabled = !live || pending || !afford
                return (
                  <button
                    key={inc.toString()}
                    className="btn-plain bid-key"
                    onClick={() => bid(inc)}
                    disabled={disabled}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      padding: '12px 4px', borderRadius: 12,
                      background: disabled ? '#efeafd' : '#6b2de6',
                      color: disabled ? '#a08fd0' : '#fff',
                      boxShadow: disabled ? 'none' : '0 8px 20px rgba(107,45,230,.3)',
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: .8, fontWeight: 700, letterSpacing: '.06em' }}>
                      {incrementLabel(inc)}
                    </span>
                    <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 16 }}>
                      {formatAmount(amount)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {flash && (
          <div
            style={{
              padding: '8px 20px', fontSize: 14, fontWeight: 700, textAlign: 'center',
              background:
                flash.kind === 'error' ? '#fdecea'
                : flash.kind === 'outbid' ? '#fff1f1'
                : flash.kind === 'stale' ? '#fff6e5' : '#e9f9ef',
              color:
                flash.kind === 'error' ? '#c0392b'
                : flash.kind === 'outbid' ? '#c0392b'
                : flash.kind === 'stale' ? '#8a5a00' : '#12703a',
            }}
          >
            {flash.text}
          </div>
        )}
      </div>
    </>
  )
}
