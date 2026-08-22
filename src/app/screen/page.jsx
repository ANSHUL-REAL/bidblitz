'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BidBlitzLogo, MonadLockup, MonadMark, Bolt } from '../../components/Logo'
import { useAuction, useCountdown } from '../../lib/useAuction'
import { formatCrore, SQUADS, squadOf, entityLabel, shortAddress } from '../../lib/format.mjs'
import { EXPLORER } from '../../lib/chain.mjs'
import { unlock, dingBid, gavel, fanfareStart, tick } from '../../lib/sound.mjs'

export default function Screen() {
  const [started, setStarted] = useState(false)
  const { state } = useAuction({ live: true, intervalMs: 400 })

  if (!started) return <StartGate onStart={() => setStarted(true)} />
  return <Board state={state} />
}

/**
 * Browsers refuse to play audio until a user gesture, so the big screen needs
 * one deliberate click before the room fills up. It doubles as the fullscreen
 * trigger and a "the projector is showing the right thing" checkpoint.
 */
function StartGate({ onStart }) {
  return (
    <main
      className="surface-dark"
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}
    >
      <div>
        <MonadMark size={90} />
        <h1 className="display" style={{ fontSize: 84, margin: '26px 0 10px' }}>
          Bid<span style={{ color: 'var(--monad-purple)' }}>Blitz</span>
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 20, margin: '0 0 30px' }}>
          Click to enable sound and go fullscreen
        </p>
        <button
          className="btn btn-shimmer"
          style={{ fontSize: 24, padding: '24px 48px' }}
          onClick={() => {
            unlock()
            document.documentElement.requestFullscreen?.().catch(() => {})
            onStart()
          }}
        >
          START THE AUCTION →
        </button>
      </div>
    </main>
  )
}

function Board({ state }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const highest = BigInt(state?.highestBid || 0)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0

  // --- sound cues, fired on transitions only ---
  const prev = useRef({ bid: 0n, lot: 0, sold: false, sec: 99 })
  useEffect(() => {
    if (!state) return
    const p = prev.current
    const lot = Number(state.lotId || 0)

    if (lot !== p.lot && open) fanfareStart()
    else if (highest > p.bid && highest > 0n) dingBid()

    if (sold && !p.sold) gavel()

    const sec = Math.ceil(remaining)
    if (live && sec <= 5 && sec !== p.sec && sec > 0) tick()

    prev.current = { bid: highest, lot, sold, sec }
  }, [state, highest, sold, open, live, remaining])

  return (
    <main className="surface-dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar state={state} live={live} />

      <section style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, padding: '28px 44px', alignItems: 'center' }}>
        <LotStage state={state} highest={highest} remaining={remaining} live={live} sold={sold} />
        <SidePanel state={state} />
      </section>

      <PurseStrip state={state} />
      {sold && <SoldTakeover state={state} highest={highest} />}
    </main>
  )
}

function TopBar({ state, live }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 44px', borderBottom: '1px solid var(--line)',
      }}
    >
      <BidBlitzLogo size={34} markSize={44} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {live && (
          <span
            className="pill"
            style={{ background: 'rgba(255,77,77,.15)', color: '#ff8080', fontSize: 16, letterSpacing: '.18em' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--live)', animation: 'bb-bolt 1.4s ease-in-out infinite' }} />
            LIVE
          </span>
        )}
        {/* Live chain height. Free — it rides the same call — and a number
            ticking every 300ms is genuinely persuasive to a judge. */}
        <span className="mono" style={{ fontSize: 17, color: 'var(--ink-3)' }}>
          Monad block #{Number(state?.blockNumber || 0).toLocaleString()}
        </span>
        <MonadLockup height={24} inverted />
      </div>
    </header>
  )
}

function LotStage({ state, highest, remaining, live, sold }) {
  const urgent = live && remaining <= 5
  const lotId = Number(state?.lotId || 0)

  if (!lotId) {
    return (
      <div style={{ textAlign: 'center' }}>
        <MonadMark size={120} style={{ opacity: 0.3 }} />
        <h2 className="display" style={{ fontSize: 64, marginTop: 28 }}>Scan to join</h2>
        <p style={{ fontSize: 26, color: 'var(--ink-3)' }}>The first lot is coming up</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
      {state?.limage && (
        <img
          src={state.limage}
          alt=""
          style={{
            width: 300, height: 300, objectFit: 'cover', borderRadius: 28, flexShrink: 0,
            boxShadow: '0 30px 90px rgba(0,0,0,.6)', border: '3px solid var(--purple-900)',
          }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, letterSpacing: '.22em', color: 'var(--ink-3)', fontWeight: 700 }}>
          LOT #{lotId}
        </div>
        <h2
          className="display"
          style={{ fontSize: 'clamp(44px,5.2vw,80px)', margin: '8px 0 22px', textWrap: 'balance' }}
        >
          {state.lname || `Lot ${lotId}`}
        </h2>

        <div style={{ fontSize: 17, letterSpacing: '.22em', color: 'var(--ink-3)', fontWeight: 700 }}>
          {sold ? 'SOLD FOR' : 'CURRENT BID'}
        </div>
        <div
          className="display"
          style={{
            fontSize: 'clamp(80px,10vw,150px)',
            color: urgent ? 'var(--live)' : 'var(--monad-purple)',
            textShadow: urgent ? '0 0 60px rgba(255,77,77,.5)' : '0 0 60px rgba(110,84,255,.4)',
            textTransform: 'none', lineHeight: 1, transition: 'color .25s ease',
          }}
        >
          {formatCrore(highest)}
        </div>

        <div style={{ fontSize: 27, color: 'var(--ink-2)', marginTop: 10, minHeight: 36 }}>
          {highest === 0n ? 'No bids yet' : <>{entityLabel(state.leadEntity)} <span style={{ color: 'var(--ink-3)' }}>leading</span></>}
        </div>

        {live && <BigTimer remaining={remaining} urgent={urgent} />}
      </div>
    </div>
  )
}

function BigTimer({ remaining, urgent }) {
  return (
    <div style={{ marginTop: 26, maxWidth: 560 }}>
      <div
        className="display"
        style={{ fontSize: 60, color: urgent ? 'var(--live)' : '#fff', textTransform: 'none' }}
      >
        {remaining.toFixed(1)}<span style={{ fontSize: 30, color: 'var(--ink-3)' }}>s</span>
      </div>
      <div style={{ height: 12, background: 'var(--line)', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
        <div
          style={{
            height: '100%', width: `${Math.min(100, (remaining / 20) * 100)}%`,
            background: urgent ? 'var(--live)' : 'var(--monad-purple)',
            boxShadow: `0 0 24px ${urgent ? 'rgba(255,77,77,.7)' : 'rgba(110,84,255,.7)'}`,
            transition: 'width .1s linear, background .25s ease',
          }}
        />
      </div>
    </div>
  )
}

function SidePanel({ state }) {
  const [qr, setQr] = useState(null)
  const [url, setUrl] = useState('')

  useEffect(() => {
    const origin = window.location.origin
    setUrl(origin)
    QRCode.toDataURL(origin, {
      width: 460,
      margin: 1,
      color: { dark: '#0e100f', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(setQr)
      .catch(() => {})
  }, [])

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ background: '#fff', padding: 16, borderRadius: 22, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        {qr ? (
          <img src={qr} alt="Join BidBlitz" style={{ width: 250, height: 250, display: 'block' }} />
        ) : (
          <div style={{ width: 250, height: 250 }} />
        )}
      </div>
      <div className="display" style={{ fontSize: 26 }}>Scan to bid</div>
      {/* Plain-text URL too: people at the back can't reliably scan a
          projection, and captive portals hijack camera-app scans. */}
      <div className="mono" style={{ fontSize: 17, color: 'var(--monad-purple)' }}>
        {url.replace(/^https?:\/\//, '')}
      </div>
      <div style={{ fontSize: 15, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5 }}>
        No wallet needed.<br />Name + password, and you're in.
      </div>
    </aside>
  )
}

function PurseStrip({ state }) {
  const purses = (state?.squadPurses || []).map((p) => BigInt(p || 0))
  const max = purses.reduce((m, p) => (p > m ? p : m), 1n)

  return (
    <footer style={{ display: 'grid', gridTemplateColumns: `repeat(${SQUADS.length},1fr)`, gap: 2, borderTop: '1px solid var(--line)' }}>
      {SQUADS.map((squad, i) => {
        const purse = purses[i] ?? 0n
        const leading = Number(state?.leadEntity || 0) === squad.id
        const pct = Number((purse * 100n) / (max || 1n))
        return (
          <div
            key={squad.id}
            style={{
              position: 'relative', padding: '18px 22px', overflow: 'hidden',
              background: leading ? `${squad.color}22` : 'transparent',
              transition: 'background .3s ease',
            }}
          >
            {/* purse as a racing trail, carried over from the hero design */}
            <div
              style={{
                position: 'absolute', left: 0, bottom: 0, height: 5, width: `${pct}%`,
                background: squad.color, boxShadow: `0 0 18px ${squad.color}`,
                transition: 'width .8s cubic-bezier(.25,.8,.25,1)',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: squad.color, transform: 'rotate(45deg)' }} />
              <span style={{ fontWeight: 700, fontSize: 19 }}>{squad.name}</span>
              {leading && <Bolt size={13} color={squad.color} />}
            </div>
            <div className="display" style={{ fontSize: 34, marginTop: 4, textTransform: 'none', color: squad.color }}>
              {formatCrore(purse)}
            </div>
          </div>
        )
      })}
    </footer>
  )
}

/**
 * The moment. This is the screenshot people post and the thing peer voters
 * remember, so it gets a full takeover rather than a badge in the corner.
 */
function SoldTakeover({ state, highest }) {
  const canvas = useRef(null)
  const squad = squadOf(state?.leadEntity)
  const accent = squad?.color || 'var(--monad-purple)'
  const unsold = highest === 0n || !state?.bidder || /^0x0+$/.test(state.bidder)

  useEffect(() => {
    if (unsold) return
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    el.width = window.innerWidth
    el.height = window.innerHeight

    const colors = [squad?.color || '#6e54ff', '#ffae45', '#ffffff', '#85e6ff']
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * el.width,
      y: -20 - Math.random() * el.height * 0.6,
      w: 7 + Math.random() * 9,
      h: 10 + Math.random() * 14,
      vy: 2.6 + Math.random() * 4.4,
      vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI,
      vr: -0.14 + Math.random() * 0.28,
      c: colors[(Math.random() * colors.length) | 0],
    }))

    let raf
    const draw = () => {
      ctx.clearRect(0, 0, el.width, el.height)
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr
        if (b.y > el.height + 30) { b.y = -25; b.x = Math.random() * el.width }
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.rot)
        ctx.fillStyle = b.c
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [unsold, squad])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
        background: unsold ? 'rgba(7,7,13,.96)' : `linear-gradient(150deg, ${accent}dd, #07070d 78%)`,
        textAlign: 'center', padding: 40,
      }}
    >
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative' }}>
        <div className="display" style={{ fontSize: 'clamp(90px,15vw,220px)', animation: 'bb-slam .55s cubic-bezier(.2,.8,.2,1) both', lineHeight: 0.9 }}>
          {unsold ? 'UNSOLD' : 'SOLD'}
        </div>

        {!unsold && (
          <>
            <div className="display" style={{ fontSize: 'clamp(34px,4.6vw,64px)', marginTop: 18, textWrap: 'balance' }}>
              {state.lname}
            </div>
            <div style={{ fontSize: 'clamp(24px,2.6vw,38px)', marginTop: 14, color: '#fff' }}>
              to <strong>{entityLabel(state.leadEntity)}</strong> for{' '}
              <span className="display" style={{ fontSize: '1.5em', textTransform: 'none' }}>
                {formatCrore(highest)}
              </span>
            </div>
            <div className="mono" style={{ marginTop: 20, fontSize: 19, color: 'rgba(255,255,255,.75)' }}>
              {shortAddress(state.bidder)}
            </div>
            {/* Verifiable without trusting this UI — the "provable outcomes" claim. */}
            <div className="mono" style={{ marginTop: 8, fontSize: 15, color: 'rgba(255,255,255,.5)' }}>
              {EXPLORER.replace(/^https?:\/\//, '')}/address/{state.contract?.slice(0, 10)}…
            </div>
          </>
        )}
      </div>
    </div>
  )
}
