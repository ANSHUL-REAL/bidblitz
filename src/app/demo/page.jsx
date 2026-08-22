'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { MonadMark } from '../../components/Logo'
import { RaceTrack } from '../../components/RaceTrack'
import { Avatar } from '../../components/Avatar'
import { DemoEngine } from '../../lib/demoEngine'
import { formatAmount, MON } from '../../lib/format.mjs'
import { IMAGE_LIBRARY } from '../../lib/lots.mjs'
import { CATEGORIES, itemsForCategories } from '../../lib/categories.mjs'

/**
 * Fully client-side playground. Runs the real product UX — host manager, live
 * board, bidder phone — against the in-browser DemoEngine with bot bidders, so
 * the whole flow is playable with no wallet and no deployed contract.
 */
export default function Demo() {
  const engineRef = useRef(null)
  if (!engineRef.current) engineRef.current = new DemoEngine()
  const engine = engineRef.current

  const [snap, setSnap] = useState(() => engine.snapshot())
  const [view, setView] = useState('host')

  useEffect(() => {
    const unsub = engine.subscribe(setSnap)
    engine.start()
    return () => { engine.stop(); unsub() }
  }, [engine])

  // Local clock so the countdown is smooth between engine heartbeats.
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: '#f1f0f9', fontFamily: "'DM Sans',system-ui,sans-serif", color: '#12121c' }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20, background: '#fff',
          boxShadow: '0 1px 0 rgba(18,18,28,.06)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#12121c' }}>
          <MonadMark size={26} />
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 20 }}>
            Bid<span style={{ color: '#6b2de6' }}>Blitz</span>
          </span>
        </Link>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: '#6b2de6', background: '#efeafd', padding: '6px 10px', borderRadius: 999 }}>
          DEMO · NO WALLET
        </span>
      </header>

      {/* view switcher */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0', maxWidth: 900, margin: '0 auto' }}>
        {[['host', 'Host manager'], ['screen', 'Big screen'], ['bidder', 'Bidder phone']].map(([k, label]) => (
          <button
            key={k}
            className="btn-plain"
            onClick={() => setView(k)}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
              border: `2px solid ${view === k ? '#6b2de6' : '#e6e2f5'}`,
              background: view === k ? '#efeafd' : '#fff',
              color: view === k ? '#5b28d9' : '#6b6d78',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px' }}>
        {view === 'host' && <HostPane snap={snap} engine={engine} />}
        {view === 'screen' && <ScreenPane snap={snap} />}
        {view === 'bidder' && <BidderPane snap={snap} engine={engine} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- shared bits --- */

function remainingOf(openLot) {
  if (!openLot || openLot.status !== 'live') return 0
  return Math.max(0, (openLot.endsAt - Date.now()) / 1000)
}

function racersFrom(snap) {
  const lot = snap.openLot
  const names = Object.fromEntries(snap.bidders.map((b) => [b.id, b.name]))
  if (lot && Object.keys(lot.bids || {}).length) {
    return Object.entries(lot.bids)
      .map(([id, amt]) => ({ key: id, label: names[id] || id, amount: amt, seed: id }))
      .sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1))
      .slice(0, 5)
  }
  // between lots: standings by remaining purse
  return [...snap.bidders]
    .sort((a, b) => (b.purse > a.purse ? 1 : -1))
    .slice(0, 5)
    .map((b) => ({ key: b.id, label: b.name, amount: b.purse, seed: b.id }))
}

function Standings({ snap }) {
  const rows = [...snap.bidders].sort((a, b) => b.wins - a.wins || (b.spent > a.spent ? 1 : -1))
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((b) => (
        <div
          key={b.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            background: b.id === 'you' ? '#efeafd' : '#fff', borderRadius: 10,
            border: '1px solid #eeecf7',
          }}
        >
          <Avatar seed={b.id} size={30} ring={b.id === 'you' ? '#6b2de6' : null} />
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
            {b.name}{b.id === 'you' ? ' (you)' : ''}
          </span>
          <span style={{ fontSize: 12, color: '#6b6d78' }}>{b.wins} won</span>
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 15, minWidth: 92, textAlign: 'right' }}>
            {formatAmount(b.purse)} <span style={{ fontSize: 11, color: '#6b2de6' }}>MON</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- host pane --- */

function HostPane({ snap, engine }) {
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [duration, setDuration] = useState(20)
  const [cats, setCats] = useState(['memes'])
  const [msg, setMsg] = useState('')
  const presets = itemsForCategories(cats)
  const toggleCat = (id) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  const open = snap.openLot
  const live = open && open.status === 'live'
  const remaining = remainingOf(open)
  const urgent = live && remaining <= 5
  const soldCount = snap.lots.filter((l) => l.status === 'sold').length

  const add = () => {
    if (!name.trim()) return
    engine.queueItem(name, image)
    setName(''); setImage('')
  }
  const startNext = () => {
    const r = engine.startLot(duration)
    setMsg(r.error || '')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* live control */}
      <section style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: `2px solid ${live ? (urgent ? '#ff4d4d' : '#6b2de6') : '#eeecf7'}` }}>
        {live && (
          <div style={{ height: 6, background: '#eeecf7' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (remaining / (open.duration || 20)) * 100)}%`, background: urgent ? '#ff4d4d' : '#6b2de6', transition: 'width .1s linear' }} />
          </div>
        )}
        <div style={{ padding: 18 }}>
          {live ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {open.image && <img src={open.image} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 700 }}>LIVE NOW</div>
                  <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>{open.name}</div>
                </div>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, color: urgent ? '#ff4d4d' : '#12121c' }}>{remaining.toFixed(1)}s</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 30, color: '#6b2de6' }}>
                  {formatAmount(open.highestBid)}<span style={{ fontSize: 13, marginLeft: 4 }}>MON</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#6b6d78' }}>
                  {open.leadId ? <><Avatar seed={open.leadId} size={22} /> {engine.nameFor(open.leadId)} leading</> : 'no bids yet'}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#6b6d78', fontSize: 15 }}>
              {snap.lots.length ? `${soldCount} sold. Ready for the next item.` : 'No item live. Queue some below and start.'}
            </div>
          )}
        </div>
      </section>

      <button
        className="btn-plain"
        disabled={!live}
        onClick={() => engine.sellLot()}
        style={{
          padding: '22px', borderRadius: 14, background: live ? '#12121c' : '#ddd7f5', color: live ? '#fff' : '#9c94bd',
          fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '.04em', textTransform: 'uppercase',
        }}
      >
        Sell this item
      </button>

      {/* queue */}
      <section style={{ background: '#fff', borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 700, marginBottom: 10 }}>
          NEXT UP · {snap.queue.length} QUEUED
        </div>

        {snap.queue.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {snap.queue.map((q, i) => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: '#faf8ff', borderRadius: 10 }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: '#9c94bd', width: 18 }}>{i + 1}</span>
                {q.image && <img src={q.image} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{q.name}</span>
                {i === 0 && !live && (
                  <button className="btn-plain" onClick={() => engine.startLot(duration, null)} style={{ background: '#6b2de6', color: '#fff', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 12 }}>start →</button>
                )}
                <button className="btn-plain" onClick={() => engine.removeQueued(q.id)} style={{ background: 'transparent', color: '#9c94bd', fontSize: 18, padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>
        )}

        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add anything — a meme, a name, an item…" maxLength={60} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          <ImageChip active={image === ''} onClick={() => setImage('')} label="no pic" />
          {image && !IMAGE_LIBRARY.includes(image) && <ImageChip src={image} active onClick={() => {}} />}
          {IMAGE_LIBRARY.map((src) => <ImageChip key={src} src={src} active={image === src} onClick={() => setImage(src)} />)}
          <label className="btn-plain" style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 10, border: '1.5px dashed #b7b0d4', background: '#faf8ff', display: 'grid', placeItems: 'center', fontSize: 20, color: '#6b2de6', cursor: 'pointer' }} title="Upload an image">
            +
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
              const f = e.target.files?.[0]; if (f) setImage(URL.createObjectURL(f))
            }} />
          </label>
        </div>
        <input className="field" style={{ marginTop: 8, fontSize: 14 }} value={image.startsWith('blob:') ? '' : image}
          onChange={(e) => setImage(e.target.value)} placeholder="…or paste an image URL for your meme / NFT" />
        <button className="btn-plain" onClick={add} disabled={!name.trim()} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, background: name.trim() ? '#efeafd' : '#f3f1fa', color: name.trim() ? '#5b28d9' : '#b7b0d4', fontWeight: 700, border: '2px solid #e6e2f5' }}>
          + Add to queue
        </button>

        {/* categories */}
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: '.16em', color: '#9c94bd', margin: '18px 0 8px' }}>CATEGORIES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map((c) => {
            const on = cats.includes(c.id)
            return (
              <button key={c.id} className="btn-plain" onClick={() => toggleCat(c.id)} title={c.blurb}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${on ? '#6b2de6' : '#e6e2f5'}`, background: on ? '#6b2de6' : '#fff', color: on ? '#fff' : '#3a3c44' }}>
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            )
          })}
        </div>

        {presets.length > 0 && (
          <>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: '.16em', color: '#9c94bd', margin: '16px 0 8px' }}>QUICK ADD</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {presets.map((lot) => (
                <button key={lot.name} className="btn-plain" onClick={() => engine.queueItem(lot.name, lot.image)} style={{ padding: '8px 12px', borderRadius: 999, background: '#faf8ff', border: '1px solid #eeecf7', fontSize: 13, fontWeight: 600 }}>
                  + {lot.name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* timer + start */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 12, color: '#6b6d78', fontWeight: 700 }}>TIMER</span>
          {[15, 20, 30, 45].map((d) => (
            <button key={d} className="btn-plain" onClick={() => setDuration(d)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${duration === d ? '#6b2de6' : '#eeecf7'}`, background: duration === d ? '#efeafd' : '#fff', fontWeight: 700, color: duration === d ? '#5b28d9' : '#6b6d78' }}>{d}s</button>
          ))}
        </div>
        <button className="btn-plain" disabled={live || !snap.queue.length} onClick={startNext} style={{ width: '100%', marginTop: 12, padding: 18, borderRadius: 14, background: live || !snap.queue.length ? '#ddd7f5' : '#6b2de6', color: live || !snap.queue.length ? '#9c94bd' : '#fff', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          {live ? 'Sell current first' : 'Start next item →'}
        </button>
        {msg && <p style={{ margin: '10px 0 0', textAlign: 'center', color: '#c0392b', fontSize: 13 }}>{msg}</p>}
      </section>

      <section style={{ background: '#fff', borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 700, marginBottom: 10 }}>STANDINGS</div>
        <Standings snap={snap} />
      </section>
    </div>
  )
}

function ImageChip({ src, active, onClick, label }) {
  return (
    <button className="btn-plain" onClick={onClick} style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 10, overflow: 'hidden', padding: 0, border: `3px solid ${active ? '#6b2de6' : '#eeecf7'}`, background: '#efeafd', fontSize: 9, color: '#6b6d78' }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : label}
    </button>
  )
}

/* ------------------------------------------------------------- screen pane --- */

function ScreenPane({ snap }) {
  const open = snap.openLot
  const live = open && open.status === 'live'
  const remaining = remainingOf(open)
  const urgent = live && remaining <= 5
  const highest = open ? open.highestBid : 0n
  const racers = useMemo(() => racersFrom(snap), [snap])
  const lastSold = [...snap.lots].reverse().find((l) => l.status === 'sold')

  return (
    <div className="surface-dark" style={{ borderRadius: 18, padding: 24, minHeight: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 20 }}>
          {snap.roomName}
        </span>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, letterSpacing: '.16em', color: '#ff8080' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#ff4d4d' }} /> LIVE
          </span>
        )}
      </div>

      {open ? (
        <>
          <div style={{ textAlign: 'center' }}>
            {open.image && <img src={open.image} alt="" style={{ width: 120, height: 120, borderRadius: 16, objectFit: 'cover', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }} onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 'clamp(28px,5vw,46px)', textTransform: 'uppercase', letterSpacing: '-.03em', margin: '10px 0 0' }}>{open.name}</div>
            <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#8d85b4', fontWeight: 700, marginTop: 10 }}>{open.status === 'sold' ? 'SOLD FOR' : 'CURRENT BID'}</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 'clamp(48px,9vw,80px)', lineHeight: 1, color: urgent ? '#ff4d4d' : '#6b2de6' }}>
              {formatAmount(highest)}<span style={{ fontSize: '.3em', marginLeft: 6 }}>MON</span>
            </div>
            {live && <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 30, color: urgent ? '#ff4d4d' : '#fff', marginTop: 4 }}>{remaining.toFixed(1)}s</div>}
          </div>
          {racers.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <RaceTrack racers={racers} dark scale={0.72} />
            </div>
          )}
        </>
      ) : lastSold ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 64, textTransform: 'uppercase' }}>SOLD</div>
          <div style={{ fontSize: 22, marginTop: 8 }}>{lastSold.name}</div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#8d85b4' }}>
          <MonadMark size={54} style={{ opacity: 0.4 }} />
          <p style={{ fontSize: 18, marginTop: 16 }}>Waiting for the host to start an item…</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- bidder pane --- */

function BidderPane({ snap, engine }) {
  const open = snap.openLot
  const live = open && open.status === 'live'
  const remaining = remainingOf(open)
  const you = snap.you
  const highest = open ? open.highestBid : 0n
  const leading = open && open.leadId === 'you'
  const [flash, setFlash] = useState('')

  const bid = (stepMon) => {
    const amount = highest + BigInt(Math.round(stepMon * 10)) * (MON / 10n)
    if (amount > you.purse) return setFlash('Not enough purse')
    const r = engine.placeBid('you', amount)
    setFlash(r.error ? r.error : `${formatAmount(amount)} MON sent`)
  }

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(''), 1800)
    return () => clearTimeout(id)
  }, [flash])

  const steps = [0.5, 1, 2, 5]

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderRadius: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700 }}>
          <Avatar seed="you" size={30} ring="#6b2de6" /> {you.name}
        </span>
        <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800 }}>{formatAmount(you.purse)} <span style={{ fontSize: 12, color: '#6b2de6' }}>MON</span></span>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', minHeight: 200 }}>
        {open ? (
          <>
            {open.image && <img src={open.image} alt="" style={{ width: 96, height: 96, borderRadius: 14, objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 24, textTransform: 'uppercase', margin: '8px 0 0' }}>{open.name}</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 46, color: leading ? '#12703a' : '#6b2de6', lineHeight: 1.1 }}>
              {formatAmount(highest)}<span style={{ fontSize: 14, marginLeft: 4 }}>MON</span>
            </div>
            <div style={{ fontSize: 14, color: leading ? '#12703a' : '#6b6d78', fontWeight: leading ? 700 : 400 }}>
              {open.status === 'sold' ? (leading ? 'You won it! 🎉' : 'Sold') : live ? (leading ? "You're winning" : open.leadId ? `${engine.nameFor(open.leadId)} leading` : 'No bids yet') : 'Lot closed'}
            </div>
            {live && <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, color: remaining <= 5 ? '#ff4d4d' : '#12121c', marginTop: 6 }}>{remaining.toFixed(1)}s</div>}
          </>
        ) : (
          <div style={{ color: '#6b6d78', paddingTop: 40 }}>Waiting for the next item…</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {steps.map((s) => {
          const amount = highest + BigInt(Math.round(s * 10)) * (MON / 10n)
          const disabled = !live || amount > you.purse
          return (
            <button key={s} className="btn-plain bid-key" onClick={() => bid(s)} disabled={disabled} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '14px 4px', borderRadius: 12, background: disabled ? '#efeafd' : '#6b2de6', color: disabled ? '#a08fd0' : '#fff', boxShadow: disabled ? 'none' : '0 8px 20px rgba(107,45,230,.3)' }}>
              <span style={{ fontSize: 10, opacity: .8, fontWeight: 700 }}>+{s}</span>
              <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 15 }}>{formatAmount(amount)}</span>
            </button>
          )
        })}
      </div>

      {flash && <div style={{ padding: '9px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'center', background: flash.includes('sent') ? '#e9f9ef' : '#fff6e5', color: flash.includes('sent') ? '#12703a' : '#8a5a00' }}>{flash}</div>}

      <p style={{ textAlign: 'center', fontSize: 13, color: '#9c94bd' }}>
        You're bidding against 6 bots. Switch to <strong>Host manager</strong> to run the auction, or <strong>Big screen</strong> to see the room view.
      </p>
    </div>
  )
}
