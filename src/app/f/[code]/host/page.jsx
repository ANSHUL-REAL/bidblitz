'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { useCountdown } from '../../../../lib/useAuction'
import { useFreeState, useFreeHost } from '../../../../lib/useFreeRoom'
import { normalizeCode, DEFAULT_DURATION, loadHostToken } from '../../../../lib/freeRoom.mjs'
import { formatAmount, entityLabel } from '../../../../lib/format.mjs'
import { itemsForCategories, FANTASY_ITEMS } from '../../../../lib/categories.mjs'
import { imageForItem } from '../../../../lib/presetArt.mjs'
import { sanitizeLotName } from '../../../../lib/lots.mjs'

/**
 * Host console for a FREE room.
 *
 * Same job as the on-chain console, minus every wallet concern: there is no gas
 * to run out of, no transaction to wait on, and no nonce to resync. Pressing
 * SELL is a POST that either worked or did not.
 *
 * The credential is a token in this browser's localStorage. Practically that
 * means the host must run the room from the device that created it — which is
 * the trade for not making them own a wallet.
 */
export default function FreeHost({ params }) {
  const { code: raw } = use(params)
  const code = normalizeCode(raw)

  const { state, error, refetch } = useFreeState({ code, live: true, intervalMs: 700 })
  const host = useFreeHost(code)
  const [hasToken, setHasToken] = useState(null)

  // localStorage is unavailable during SSR, so this can only be decided after
  // mount — null means "still checking", not "not the host".
  useEffect(() => { setHasToken(Boolean(loadHostToken(code))) }, [code])

  if (error === 'room not found') return <Blocked title={`No room ${code}`} body="Check the code on the big screen." />
  if (hasToken === false) {
    return (
      <Blocked
        title="Not your room"
        body="Free rooms are run from the browser that created them, and this one isn't it. You can still join and bid."
        action={{ href: `/f/${code}`, label: 'Go bid instead' }}
      />
    )
  }
  if (hasToken === null) return null

  return <Console code={code} state={state} host={host} refetch={refetch} />
}

function Console({ code, state, host, refetch }) {
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const isOpen = Number(state?.openLotId || 0) !== 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = isOpen && remaining <= 5
  const isFantasy = Number(state?.mode) === 1

  const catItems = useMemo(
    () => (isFantasy ? FANTASY_ITEMS : itemsForCategories(state?.categories || ['memes'])),
    [isFantasy, state?.categories],
  )

  async function run(fn, label) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: label })
      setTimeout(refetch, 250)
    } catch (err) {
      setMsg({ ok: false, text: String(err?.message || err).slice(0, 160) })
    } finally {
      setBusy(false)
    }
  }

  const start = (lotName, lotImage) => {
    const clean = sanitizeLotName(lotName)
    if (!clean) return setMsg({ ok: false, text: 'Name required' })
    return run(
      () => host.startLot(clean, lotImage || '', duration),
      `Started: ${clean}`,
    ).then(() => { setName(''); setImage('') })
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
        <Link href={`/f/${code}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BidBlitzMark size={26} />
          <span>
            <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17, color: '#12121c' }}>
              {state?.rname || 'Room'}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.12em' }}>
              {code} · FREE
            </span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Link href={`/f/${code}/screen`} style={{ fontSize: 13, fontWeight: 700, color: '#6b6d78' }}>Screen</Link>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: '#6b2de6' }}>HOST</span>
        </div>
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px 0' }}>
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
                <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>
                  LOT #{state.lotId} · {remaining}s LEFT
                </div>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: '-.03em', marginTop: 4 }}>
                  {state.lname}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#2a2a3a' }}>
                  {highest === 0n
                    ? 'No bids yet'
                    : <>
                        <strong style={{ fontFamily: "'Archivo',sans-serif", fontSize: 22 }}>{formatAmount(highest)} PTS</strong>
                        {' · '}{entityLabel(state.leadEntity, state?.mode)} leading
                      </>}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    className="btn-plain" disabled={busy}
                    onClick={() => run(() => host.sellLot(state.lotId), 'Sold!')}
                    style={{
                      flex: 2, padding: '18px 0', borderRadius: 14, background: '#12703a', color: '#fff',
                      fontWeight: 800, fontSize: 18, letterSpacing: '.06em', opacity: busy ? .6 : 1,
                    }}
                  >
                    SELL
                  </button>
                  <button
                    className="btn-plain" disabled={busy}
                    onClick={() => run(() => host.closeLot(), 'Lot closed — nobody charged')}
                    style={{
                      flex: 1, padding: '18px 0', borderRadius: 14, border: '2px solid #eeecf7',
                      background: '#fff', color: '#6b6d78', fontWeight: 700, fontSize: 15,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>
                  NOTHING LIVE · {state?.nEntities ?? 0} IN THE ROOM
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 15, color: '#6b6d78' }}>
                  Put something on the block. Free rooms cost nothing, so run as many as you like.
                </p>
              </>
            )}
          </div>
        </section>

        {/* ---------------- start a lot ---------------- */}
        {!isOpen && (
          <section style={{ background: '#fff', borderRadius: 18, padding: 20, marginTop: 14, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: '#6b6d78' }}>
              WHAT&apos;S ON THE BLOCK
            </label>
            <input
              className="field" style={{ marginTop: 8 }} value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A cursed meme" maxLength={60}
              onKeyDown={(e) => { if (e.key === 'Enter') start(name, image) }}
            />

            <label style={{ display: 'block', marginTop: 14, fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: '#6b6d78' }}>
              IMAGE URL (OPTIONAL)
            </label>
            <input
              className="field" style={{ marginTop: 8, fontSize: 14 }} value={image}
              onChange={(e) => setImage(e.target.value)} placeholder="https://…" maxLength={500}
            />

            <label style={{ display: 'block', marginTop: 14, fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: '#6b6d78' }}>
              LOT LENGTH
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {[10, 20, 30, 60].map((s) => (
                <button
                  key={s} className="btn-plain" onClick={() => setDuration(s)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    border: `2px solid ${duration === s ? '#6b2de6' : '#e6e2f5'}`,
                    background: duration === s ? '#efeafd' : '#fff',
                    color: duration === s ? '#5b28d9' : '#6b6d78',
                  }}
                >
                  {s}s
                </button>
              ))}
            </div>

            <button
              className="btn-plain" disabled={busy || !name.trim()}
              onClick={() => start(name, image)}
              style={{
                width: '100%', marginTop: 16, padding: '18px 0', borderRadius: 14,
                background: name.trim() ? '#6b2de6' : '#eeecf7',
                color: name.trim() ? '#fff' : '#a08fd0',
                fontWeight: 800, fontSize: 17, letterSpacing: '.06em',
              }}
            >
              START THE LOT
            </button>

            {catItems.length > 0 && (
              <>
                <div style={{ marginTop: 20, fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: '#6b6d78' }}>
                  OR ONE-TAP FROM YOUR CATEGORIES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {catItems.slice(0, 18).map((item) => {
                    const label = typeof item === 'string' ? item : item.name
                    return (
                      <button
                        key={label} className="btn-plain" disabled={busy}
                        onClick={() => start(label, imageForItem(label))}
                        style={{
                          padding: '10px 13px', borderRadius: 10, border: '1px solid #e6e2f5',
                          background: '#fbfaff', fontSize: 13.5, fontWeight: 600, color: '#2a2a3a',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {msg && (
          <p
            style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: msg.ok ? '#e9f9ef' : '#fdecea', color: msg.ok ? '#12703a' : '#c0392b',
            }}
          >
            {msg.text}
          </p>
        )}
      </div>
    </main>
  )
}

function Blocked({ title, body, action }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <BidBlitzMark size={50} style={{ opacity: .35 }} />
        <h1 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: '-.03em', textTransform: 'uppercase', margin: '18px 0 8px' }}>
          {title}
        </h1>
        <p style={{ color: '#6b6d78', margin: '0 0 22px', maxWidth: '38ch' }}>{body}</p>
        <Link className="btn" href={action?.href || '/'}>{action?.label || 'Back to BidBlitz'}</Link>
      </div>
    </main>
  )
}
