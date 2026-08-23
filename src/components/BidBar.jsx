'use client'
import { useEffect, useRef, useState } from 'react'
import { useCountdown, formatCountdown } from '../lib/useAuction'
import { formatAmount, incrementLabel, QUICK_INCREMENTS, ESCROW_INCREMENTS, entityLabel, entityColor } from '../lib/format.mjs'
import { txUrl } from '../lib/chain.mjs'

/**
 * The bidding surface: pinned to the bottom of the viewport while a lot is live.
 *
 * Laid out top-to-bottom rather than in columns, because it is used one-handed
 * on a phone with twenty seconds on the clock. In reading order that is: how
 * long have I got, what is it at, am I winning, and only then the buttons —
 * which sit last so they are under the thumb rather than under the text.
 *
 * `unit` exists so a FREE room can never claim to be moving MON. Free rooms
 * reuse this whole component; their points are not a currency and must not be
 * labelled like one.
 */
export function BidBar({ state, signer, me, refreshMe, roomId, unit = 'MON' }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const purse = BigInt(me?.purse || 0)
  const paddleColor = entityColor(me?.entityId, state?.mode)

  // Real-MON (escrow) rooms: bids are the bidder's OWN MON, sent as value and
  // capped by wallet balance; play-money rooms bid against the purse.
  const escrow = Boolean(state?.escrow)
  const [walletBal, setWalletBal] = useState(0n)
  const spendable = escrow ? walletBal : purse
  const increments = escrow ? ESCROW_INCREMENTS : QUICK_INCREMENTS

  // Free rooms cap what a single bid may be, so buying points wins you more
  // lots rather than making you unbeatable on any one. 0 = no cap (MON rooms).
  const maxBid = BigInt(state?.maxBid || 0)
  const capped = (amount) => maxBid > 0n && amount > maxBid
  const atCap = maxBid > 0n && highest >= maxBid

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

  // Keep the bidder's real balance fresh in escrow rooms.
  useEffect(() => {
    if (!escrow || !signer?.balance) return
    let alive = true
    const load = () => signer.balance().then((b) => { if (alive) setWalletBal(BigInt(b || 0n)) }).catch(() => {})
    load()
    const id = setInterval(load, 2500)
    return () => { alive = false; clearInterval(id) }
  }, [escrow, signer])

  if (!signer || (!live && !sold)) return null

  const nextBid = (inc) => highest + inc
  const urgent = remaining <= 5
  const pct = state?.duration ? (remaining / state.duration) * 100 : (remaining / 20) * 100

  async function bid(inc) {
    const now = Date.now()
    if (pending || now < lockedUntil.current || !live) return
    lockedUntil.current = now + 400 // a double-tap must not become two bids

    const amount = nextBid(inc)

    // `amount` is always highest+inc, so it can't be <= the highest we rendered;
    // real staleness (outbid since the last poll) is caught server-side. What we
    // CAN cheaply prevent is spending past what we can afford.
    if (capped(amount)) {
      return setFlash({ kind: 'stale', text: `Max bid here is ${formatAmount(maxBid)} ${unit}` })
    }
    if (amount > spendable) {
      return setFlash({
        kind: 'stale',
        text: escrow ? 'Not enough MON in your wallet' : 'Not enough purse left',
      })
    }

    setPending(true)
    setFlash(null)
    try {
      navigator.vibrate?.(30)
      const hash = await signer.placeBid(roomId, state.lotId, amount, escrow ? amount : 0n)
      setFlash({ kind: 'sent', text: `${formatAmount(amount)} ${unit} — sent`, hash })
    } catch (err) {
      await signer.syncNonce?.().catch(() => {})
      setFlash({ kind: 'error', text: String(err?.message || err).slice(0, 90) })
    } finally {
      setPending(false)
      refreshTimer.current = setTimeout(refreshMe, 800)
    }
  }

  const statusColor = sold ? '#12121c' : leading ? '#12703a' : urgent ? '#ff4d4d' : '#6b2de6'

  return (
    <>
      {/* Reserve page space so the bar never covers the footer. */}
      <div style={{ height: 'var(--bidbar-h, 246px)' }} aria-hidden="true" />

      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: '#fff', borderTop: `3px solid ${statusColor}`,
          boxShadow: '0 -10px 44px rgba(30,20,70,.18)',
          transition: 'border-color .3s ease',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Timer runs the full width — readable from the corner of your eye. */}
        <div style={{ height: 6, background: '#eeecf7', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
              background: urgent ? '#ff4d4d' : '#6b2de6',
              transition: 'width .2s linear, background .3s ease',
            }}
          />
        </div>

        <div style={{ maxWidth: 620, margin: '0 auto', padding: '12px 16px 14px' }}>
          {/* ---- what it is, what it's at ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            {state?.limage && (
              <img
                src={state.limage}
                alt=""
                style={{ width: 46, height: 46, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: '.16em', color: '#9c94bd', fontWeight: 800 }}>
                LOT #{state?.lotId}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17, lineHeight: 1.15,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {state?.lname}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '.16em', color: '#9c94bd', fontWeight: 800 }}>
                {sold ? 'SOLD FOR' : 'CURRENT'}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 900, lineHeight: 1,
                  fontSize: 30, letterSpacing: '-.03em', color: statusColor,
                  transition: 'color .3s ease',
                }}
              >
                {formatAmount(highest)}
                <span style={{ fontSize: 12, marginLeft: 4, color: '#9c94bd' }}>{unit}</span>
              </div>
            </div>
          </div>

          {/* ---- am I winning, and what have I got left ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 12px', borderRadius: 999, minWidth: 0,
                background: sold ? '#f3f1fa' : leading ? '#e9f9ef' : highest === 0n ? '#f3f1fa' : '#fff1f1',
                color: sold ? '#12121c' : leading ? '#12703a' : highest === 0n ? '#6b6d78' : '#c0392b',
                fontWeight: 800, fontSize: 13.5,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, transform: 'rotate(45deg)', background: paddleColor, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sold
                  ? leading ? 'You won it' : `${entityLabel(state.leadEntity, state?.mode)} won`
                  : highest === 0n
                    ? 'No bids yet — open it'
                    : leading
                      ? "You're winning"
                      : `${entityLabel(state.leadEntity, state?.mode)} leading`}
              </span>
            </span>

            {live && (
              <span
                style={{
                  marginLeft: 'auto', flexShrink: 0,
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22,
                  color: urgent ? '#ff4d4d' : '#12121c',
                }}
              >
                {formatCountdown(remaining)}s
              </span>
            )}
          </div>

          {/* ---- the buttons, last and biggest ---- */}
          {live && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
                {increments.map((inc) => {
                  const amount = nextBid(inc)
                  const afford = amount <= spendable && !capped(amount)
                  const disabled = pending || !afford
                  return (
                    <button
                      key={inc.toString()}
                      className="btn-plain bid-key"
                      onClick={() => bid(inc)}
                      disabled={disabled}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        padding: '15px 4px', borderRadius: 14,
                        background: disabled ? '#f1edfb' : '#6b2de6',
                        color: disabled ? '#b0a3d8' : '#fff',
                        boxShadow: disabled ? 'none' : '0 10px 24px rgba(107,45,230,.32)',
                        transition: 'transform .08s ease',
                      }}
                    >
                      <span style={{ fontSize: 10.5, opacity: .85, fontWeight: 800, letterSpacing: '.06em' }}>
                        {incrementLabel(inc)}
                      </span>
                      <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: '-.02em' }}>
                        {formatAmount(amount)}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div style={{ textAlign: 'center', marginTop: 9, fontSize: 12.5, color: '#9c94bd' }}>
                {atCap ? (
                  <span style={{ color: '#8a5a00', fontWeight: 700 }}>
                    At this room&apos;s {formatAmount(maxBid)} {unit} max — it&apos;s a race now
                  </span>
                ) : (
                  <>
                    {escrow ? 'wallet' : 'your purse'}{' '}
                    <strong style={{ color: '#12121c' }}>{formatAmount(spendable)} {unit}</strong>
                    {maxBid > 0n && <span> · max {formatAmount(maxBid)}</span>}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {flash && (
          <div
            style={{
              padding: '9px 20px', fontSize: 14, fontWeight: 700, textAlign: 'center',
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
            {flash.hash && (
              <>
                {' · '}
                <a href={txUrl(flash.hash)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  view tx ↗
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
