'use client'
import { useEffect, useState } from 'react'
import { BidBlitzLogo } from '../../components/Logo'
import { useAuction, useCountdown } from '../../lib/useAuction'
import { formatMon, entityLabel } from '../../lib/format.mjs'
import { PRESET_LOTS, IMAGE_LIBRARY, DEFAULT_DURATION, sanitizeLotName } from '../../lib/lots.mjs'

const SECRET_KEY = 'bidblitz:admin'

/**
 * Built mobile-first and thumb-sized on purpose: you will be narrating the
 * auction and driving it at the same time, standing in front of the room.
 *
 * The secret is held in sessionStorage and sent in a POST body — never in the
 * URL, which Vercel logs, Referer headers leak, and a projected tab reveals.
 */
export default function Admin() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem(SECRET_KEY)
    if (saved) {
      setSecret(saved)
      call(saved, { action: 'auth' })
        .then(() => setAuthed(true))
        .catch(() => sessionStorage.removeItem(SECRET_KEY))
    }
  }, [])

  if (!authed) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <form
          className="card"
          style={{ padding: 26, width: '100%', maxWidth: 380 }}
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await call(secret, { action: 'auth' })
              sessionStorage.setItem(SECRET_KEY, secret)
              setAuthed(true)
            } catch {
              alert('Wrong secret')
            }
          }}
        >
          <BidBlitzLogo size={22} markSize={30} />
          <h1 style={{ fontSize: 20, margin: '18px 0 4px' }}>Organizer</h1>
          <input
            className="field"
            style={{ marginTop: 14 }}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="ADMIN_SECRET"
            autoFocus
          />
          <button className="btn" style={{ width: '100%', marginTop: 14 }}>Unlock</button>
        </form>
      </main>
    )
  }

  return <Console secret={secret} />
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
  const [msg, setMsg] = useState('')

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const openLot = Number(state?.openLotId || 0)
  const isOpen = openLot !== 0
  const highest = BigInt(state?.highestBid || 0)

  async function run(body, label) {
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      await call(secret, body)
      setMsg(label)
      setTimeout(refetch, 700)
    } catch (err) {
      setMsg(String(err.message))
    } finally {
      setBusy(false)
    }
  }

  const start = (lotName, lotImage) => {
    const clean = sanitizeLotName(lotName)
    if (!clean) return setMsg('Name required')
    return run({ action: 'start', name: clean, image: lotImage || '', duration }, `Started: ${clean}`)
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg-2)', paddingBottom: 40 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff' }}>
        <BidBlitzLogo size={18} markSize={24} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--ink-3)' }}>ORGANIZER</span>
      </header>

      {/* live status */}
      <section style={{ padding: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          {isOpen ? (
            <>
              <div style={{ fontSize: 12, letterSpacing: '.14em', color: 'var(--ink-3)', fontWeight: 700 }}>
                LOT #{state.lotId} · LIVE
              </div>
              <div className="display" style={{ fontSize: 26, margin: '6px 0' }}>{state.lname}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="display" style={{ fontSize: 34, color: 'var(--monad-purple)', textTransform: 'none' }}>
                  {formatMon(highest)}
                </div>
                <div className="display" style={{ fontSize: 26, color: remaining <= 5 ? 'var(--live)' : 'var(--ink)', textTransform: 'none' }}>
                  {remaining.toFixed(1)}s
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>
                {highest === 0n ? 'No bids yet' : `${entityLabel(state.leadEntity)} leading`}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--ink-3)' }}>
              {state?.lotId > 0 ? `Lot #${state.lotId} closed. Ready for the next.` : 'No lot yet.'}
            </div>
          )}
        </div>

        {/* The big one. sellLot cannot revert by design, so this always advances. */}
        <button
          className="btn"
          style={{ width: '100%', marginTop: 14, fontSize: 22, padding: '26px', background: isOpen ? 'var(--ink)' : 'var(--purple-200)' }}
          disabled={!isOpen || busy}
          onClick={() => run({ action: 'sell', lotId: state.lotId }, 'SOLD')}
        >
          🔨 SELL THIS LOT
        </button>

        {msg && (
          <p style={{ margin: '10px 0 0', fontSize: 14, textAlign: 'center', color: 'var(--ink-2)', wordBreak: 'break-word' }}>{msg}</p>
        )}
      </section>

      {/* live lot entry — type whatever the room shouts */}
      <section style={{ padding: '0 16px' }}>
        <h2 style={{ fontSize: 13, letterSpacing: '.12em', color: 'var(--ink-3)', margin: '10px 0' }}>
          NEW LOT — TYPE ANYTHING
        </h2>
        <div className="card" style={{ padding: 16 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>TIMER</span>
            {[15, 20, 30, 45].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${duration === d ? 'var(--monad-purple)' : 'var(--line)'}`,
                  background: duration === d ? 'var(--purple-050)' : '#fff',
                  fontWeight: 700, color: duration === d ? 'var(--purple-700)' : 'var(--ink-3)',
                }}
              >
                {d}s
              </button>
            ))}
          </div>

          <button
            className="btn btn-shimmer"
            style={{ width: '100%', marginTop: 14, fontSize: 18, padding: '20px' }}
            disabled={isOpen || busy || !name.trim()}
            onClick={() => start(name, image).then(() => setName(''))}
          >
            {isOpen ? 'SELL THE CURRENT LOT FIRST' : 'START BIDDING →'}
          </button>
        </div>
      </section>

      {/* one-tap presets */}
      <section style={{ padding: '18px 16px 0' }}>
        <h2 style={{ fontSize: 13, letterSpacing: '.12em', color: 'var(--ink-3)', margin: '0 0 10px' }}>
          PRESETS — ONE TAP
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {PRESET_LOTS.map((lot) => (
            <button
              key={lot.name}
              disabled={isOpen || busy}
              onClick={() => start(lot.name, lot.image)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer',
                background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                opacity: isOpen ? 0.4 : 1, textAlign: 'left',
              }}
            >
              <img
                src={lot.image}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: 'var(--purple-050)' }}
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{lot.name}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.1em' }}>
                {lot.kind.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ padding: '20px 16px 0' }}>
        <button
          onClick={() => run({ action: 'close' }, 'Lot force-closed')}
          disabled={busy}
          style={{
            width: '100%', padding: 14, borderRadius: 'var(--radius)', cursor: 'pointer',
            border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-3)', fontWeight: 700,
          }}
        >
          Force-close current lot (no sale)
        </button>
      </section>
    </main>
  )
}

function ImageChoice({ src, active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, width: 56, height: 56, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
        border: `3px solid ${active ? 'var(--monad-purple)' : 'var(--line)'}`,
        background: 'var(--purple-050)', padding: 0, fontSize: 10, color: 'var(--ink-3)',
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
