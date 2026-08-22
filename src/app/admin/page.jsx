'use client'
import { useEffect, useState } from 'react'
import { MonadMark } from '../../components/Logo'
import { useAuction, useCountdown } from '../../lib/useAuction'
import { formatAmount, entityLabel, squadOf, SQUADS } from '../../lib/format.mjs'
import { PRESET_LOTS, IMAGE_LIBRARY, DEFAULT_DURATION, sanitizeLotName } from '../../lib/lots.mjs'

const SECRET_KEY = 'bidblitz:admin'

/**
 * Organizer console. Built thumb-sized and mobile-first on purpose: you will be
 * narrating the auction and driving it at the same time, standing in front of
 * the room, holding a phone.
 *
 * The secret lives in sessionStorage and goes out in a POST body — never a query
 * string, which Vercel logs, Referer headers leak, and a projected tab reveals.
 */
export default function Admin() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = sessionStorage.getItem(SECRET_KEY)
    if (!saved) return
    setSecret(saved)
    call(saved, { action: 'auth' })
      .then(() => setAuthed(true))
      .catch(() => sessionStorage.removeItem(SECRET_KEY))
  }, [])

  if (authed) return <Console secret={secret} />

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: 'linear-gradient(180deg,#fbfbff,#eceaf6)' }}>
      <form
        style={{ background: '#fff', borderRadius: 18, boxShadow: '0 22px 60px rgba(30,20,70,.1)', padding: 28, width: '100%', maxWidth: 380 }}
        onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          try {
            await call(secret, { action: 'auth' })
            sessionStorage.setItem(SECRET_KEY, secret)
            setAuthed(true)
          } catch {
            setError('Wrong secret')
          }
        }}
      >
        <MonadMark size={38} />
        <h1 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: '-.03em', textTransform: 'uppercase', margin: '16px 0 4px' }}>
          Organizer
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: '#6b6d78' }}>Run the auction from here.</p>
        <input
          className="field"
          style={{ marginTop: 18 }}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ADMIN_SECRET"
          autoFocus
        />
        <button className="btn" style={{ width: '100%', marginTop: 14 }}>Unlock</button>
        {error && <p style={{ margin: '12px 0 0', color: '#c0392b', fontSize: 14 }}>{error}</p>}
      </form>
    </main>
  )
}

async function call(secret, body) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `failed (${res.status})`)
  return data
}

function Console({ secret }) {
  const { state, refetch } = useAuction({ live: true, intervalMs: 700 })
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const isOpen = Number(state?.openLotId || 0) !== 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = isOpen && remaining <= 5

  async function run(body, label) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await call(secret, body)
      setMsg({ ok: true, text: label })
      setTimeout(refetch, 700)
    } catch (err) {
      setMsg({ ok: false, text: String(err.message) })
    } finally {
      setBusy(false)
    }
  }

  const start = (lotName, lotImage) => {
    const clean = sanitizeLotName(lotName)
    if (!clean) return setMsg({ ok: false, text: 'Name required' })
    return run({ action: 'start', name: clean, image: lotImage || '', duration }, `Started: ${clean}`)
      .then(() => setName(''))
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#f1f0f9', paddingBottom: 48 }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: '#fff', position: 'sticky', top: 0, zIndex: 20,
          boxShadow: '0 1px 0 rgba(18,18,28,.06)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MonadMark size={26} />
          <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: '-.02em' }}>
            Bid<span style={{ color: '#6b2de6' }}>Blitz</span>
          </span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: '#6b6d78' }}>ORGANIZER</span>
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px 0' }}>
        {/* ---------------- live status ---------------- */}
        <section
          style={{
            background: '#fff', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 22px 60px rgba(30,20,70,.08)',
            border: `2px solid ${isOpen ? (urgent ? '#ff4d4d' : '#6b2de6') : '#eeecf7'}`,
            transition: 'border-color .3s ease',
          }}
        >
          {isOpen && (
            <div style={{ height: 6, background: '#eeecf7' }}>
              <div
                style={{
                  height: '100%', width: `${Math.min(100, (remaining / duration) * 100)}%`,
                  background: urgent ? '#ff4d4d' : '#6b2de6', transition: 'width .1s linear',
                }}
              />
            </div>
          )}

          <div style={{ padding: 20 }}>
            {isOpen ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {state.limage && (
                    <img
                      src={state.limage}
                      alt=""
                      style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>
                      LOT #{state.lotId} · LIVE
                    </div>
                    <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 24, letterSpacing: '-.02em', lineHeight: 1.1 }}>
                      {state.lname}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>CURRENT BID</div>
                    <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 40, letterSpacing: '-.03em', color: '#6b2de6', lineHeight: 1 }}>
                      {formatAmount(highest)}<span style={{ fontSize: 15, marginLeft: 5 }}>MON</span>
                    </div>
                    <div style={{ fontSize: 14, color: '#2a2a3a', marginTop: 4 }}>
                      {highest === 0n ? 'No bids yet' : `${entityLabel(state.leadEntity)} leading`}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 34,
                      color: urgent ? '#ff4d4d' : '#12121c', letterSpacing: '-.03em',
                    }}
                  >
                    {remaining.toFixed(1)}s
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#6b6d78', fontSize: 16 }}>
                {Number(state?.lotId || 0) > 0
                  ? <>Lot #{state.lotId} closed{state?.sold ? ` — ${entityLabel(state.leadEntity)} took it` : ''}. Ready for the next.</>
                  : 'No lot yet. Start one below.'}
              </div>
            )}
          </div>
        </section>

        {/* The one button that matters. sellLot cannot revert by design, so this
            always advances the auction — it is pressed in front of the room. */}
        <button
          className="btn-plain"
          disabled={!isOpen || busy}
          onClick={() => run({ action: 'sell', lotId: state.lotId }, 'SOLD')}
          style={{
            width: '100%', marginTop: 14, padding: '28px 20px', borderRadius: 16,
            background: isOpen ? '#12121c' : '#ddd7f5',
            color: isOpen ? '#fff' : '#9c94bd',
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 24,
            letterSpacing: '.04em', textTransform: 'uppercase',
            boxShadow: isOpen ? '0 16px 34px rgba(18,18,28,.28)' : 'none',
            transition: 'transform .12s ease, background .2s ease',
          }}
          onPointerDown={(e) => isOpen && (e.currentTarget.style.transform = 'scale(.97)')}
          onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Sell this lot
        </button>

        {msg && (
          <p
            style={{
              margin: '12px 0 0', padding: '10px 14px', borderRadius: 10, fontSize: 14,
              fontWeight: 600, textAlign: 'center', wordBreak: 'break-word',
              background: msg.ok ? '#e9f9ef' : '#fdecea', color: msg.ok ? '#12703a' : '#c0392b',
            }}
          >
            {msg.text}
          </p>
        )}

        {/* ---------------- new lot ---------------- */}
        <h2 style={{ fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', margin: '26px 0 10px', fontWeight: 700 }}>
          NEW LOT — TYPE WHATEVER THE ROOM SHOUTS
        </h2>

        <section style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who or what is on the block?"
            maxLength={60}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
            <ImageChoice active={image === ''} onClick={() => setImage('')} label="none" />
            {IMAGE_LIBRARY.map((src) => (
              <ImageChoice key={src} src={src} active={image === src} onClick={() => setImage(src)} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <span style={{ fontSize: 12, color: '#6b6d78', fontWeight: 700, letterSpacing: '.1em' }}>TIMER</span>
            {[15, 20, 30, 45].map((d) => (
              <button
                key={d}
                className="btn-plain"
                onClick={() => setDuration(d)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10,
                  border: `2px solid ${duration === d ? '#6b2de6' : '#eeecf7'}`,
                  background: duration === d ? '#efeafd' : '#fff',
                  fontWeight: 700, color: duration === d ? '#5b28d9' : '#6b6d78',
                }}
              >
                {d}s
              </button>
            ))}
          </div>

          <button
            className="btn-plain"
            disabled={isOpen || busy || !name.trim()}
            onClick={() => start(name, image)}
            style={{
              width: '100%', marginTop: 14, padding: '20px', borderRadius: 14,
              background: isOpen || !name.trim() ? '#ddd7f5' : '#6b2de6',
              color: isOpen || !name.trim() ? '#9c94bd' : '#fff',
              fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 18,
              letterSpacing: '.05em', textTransform: 'uppercase',
              boxShadow: isOpen || !name.trim() ? 'none' : '0 14px 30px rgba(107,45,230,.3)',
            }}
          >
            {isOpen ? 'Sell the current lot first' : 'Start bidding →'}
          </button>
        </section>

        {/* ---------------- presets ---------------- */}
        <h2 style={{ fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', margin: '26px 0 10px', fontWeight: 700 }}>
          PRESETS — ONE TAP
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {PRESET_LOTS.map((lot) => (
            <button
              key={lot.name}
              className="btn-plain"
              disabled={isOpen || busy}
              onClick={() => start(lot.name, lot.image)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left',
                background: '#fff', border: '1px solid #eeecf7', borderRadius: 14,
                opacity: isOpen ? .45 : 1,
              }}
            >
              <img
                src={lot.image}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: '#efeafd', flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{lot.name}</span>
              <span style={{ fontSize: 10, color: '#6b2de6', letterSpacing: '.12em', fontWeight: 700, background: '#efeafd', padding: '4px 8px', borderRadius: 999 }}>
                {lot.kind.toUpperCase()}
              </span>
            </button>
          ))}
        </div>

        {/* ---------------- purses ---------------- */}
        <h2 style={{ fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', margin: '26px 0 10px', fontWeight: 700 }}>
          PURSES
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {SQUADS.map((sq, i) => (
            <div
              key={sq.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: '#fff', borderRadius: 12, border: '1px solid #eeecf7',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: sq.color }} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{sq.name}</span>
              <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17 }}>
                {formatAmount(state?.squadPurses?.[i] ?? 0n)}
              </span>
            </div>
          ))}
        </div>

        <button
          className="btn-plain"
          onClick={() => run({ action: 'close' }, 'Lot force-closed')}
          disabled={busy}
          style={{
            width: '100%', marginTop: 26, padding: 14, borderRadius: 12,
            border: '1px solid #ddd7f5', background: 'transparent', color: '#6b6d78', fontWeight: 700,
          }}
        >
          Force-close current lot (no sale)
        </button>
      </div>
    </main>
  )
}

function ImageChoice({ src, active, onClick, label }) {
  return (
    <button
      className="btn-plain"
      onClick={onClick}
      style={{
        flexShrink: 0, width: 56, height: 56, borderRadius: 12, overflow: 'hidden', padding: 0,
        border: `3px solid ${active ? '#6b2de6' : '#eeecf7'}`,
        background: '#efeafd', fontSize: 10, color: '#6b6d78',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      ) : (
        label
      )}
    </button>
  )
}
