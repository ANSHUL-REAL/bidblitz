'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { Avatar } from '../../../../components/Avatar'
import { normalizeCode } from '../../../../lib/freeRoom.mjs'
import { formatAmount, shortAddress } from '../../../../lib/format.mjs'

/**
 * A free room's ledger: every lot, who won it, and every bid underneath.
 *
 * The on-chain rooms link each row to a transaction. A free room has no
 * transactions to link — that is what makes it free — so this is the record
 * instead, and it says so rather than implying a chain that isn't there.
 *
 * Opened in its own tab from the room, so checking what happened three lots ago
 * never costs you the live one.
 */
export default function FreeHistory({ params }) {
  const { code: raw } = use(params)
  const code = normalizeCode(raw)

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!code) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/free/log?code=${code}`, { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) setError(body.error || 'Could not load the history.')
        else { setData(body); setError('') }
      } catch (e) {
        if (alive) setError(String(e?.message || e))
      }
    }
    load()
    // Slower than the room's poll: this is a reference view, not the auction.
    const id = setInterval(load, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [code])

  if (error) {
    return (
      <Shell code={code}>
        <p style={{ color: '#c0392b', fontSize: 15 }}>{error}</p>
      </Shell>
    )
  }
  if (!data) return <Shell code={code}><p style={{ color: '#6b6d78' }}>Loading…</p></Shell>

  const { totals, lots, standings } = data

  return (
    <Shell code={code} title={data.title} closed={data.closed}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          ['LOTS RUN', totals.lots],
          ['SOLD', totals.sold],
          ['BIDS', totals.bids],
          ['PLAYERS', totals.players],
        ].map(([label, n]) => (
          <div key={label}>
            <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800 }}>{label}</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26 }}>{n}</div>
          </div>
        ))}
      </div>

      {standings.length > 0 && (
        <section style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid #eeecf7' }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800 }}>STANDINGS</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {standings.map((p, i) => (
              <div key={p.addr} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: i === 0 ? '#f3eeff' : '#fbfaff' }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: '#9c94bd', width: 18 }}>{i + 1}</span>
                <Avatar seed={p.seed} size={26} />
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name || shortAddress(p.addr)}
                </span>
                <span style={{ fontSize: 12.5, color: '#6b6d78' }}>{formatAmount(p.spent)} spent</span>
                <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 16, color: p.wins ? '#5b28d9' : '#c9c3dd', minWidth: 20, textAlign: 'right' }}>
                  {p.wins}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800, marginBottom: 10 }}>
        EVERY LOT
      </div>

      {lots.length === 0 ? (
        <p style={{ color: '#9c94bd', fontSize: 14 }}>Nothing has been auctioned yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {lots.map((l) => {
            const expanded = open === l.lotId
            return (
              <div key={l.lotId} style={{ background: '#fff', borderRadius: 14, border: '1px solid #eeecf7', overflow: 'hidden' }}>
                <button
                  className="btn-plain"
                  onClick={() => setOpen(expanded ? null : l.lotId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', background: 'transparent', textAlign: 'left' }}
                >
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11.5, color: '#9c94bd' }}>#{l.lotId}</span>
                  {l.image
                    ? <img src={l.image} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : <span style={{ width: 32, height: 32, borderRadius: 8, background: '#efeafd', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>🖼</span>}
                  <span style={{ fontWeight: 800, fontSize: 14.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.name}
                  </span>
                  {l.won ? (
                    <>
                      <span style={{ fontSize: 12.5, color: '#6b6d78', whiteSpace: 'nowrap' }}>
                        → <strong style={{ color: '#12121c' }}>{l.winner.name || shortAddress(l.winner.addr)}</strong>
                      </span>
                      <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 15, color: '#5b28d9' }}>
                        {formatAmount(l.amount)}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9c94bd' }}>{l.sold ? 'unsold' : 'live'}</span>
                  )}
                  <span style={{ color: '#c9c3dd', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div style={{ borderTop: '1px solid #f3f1fa', padding: '10px 14px 12px', background: '#fbfaff' }}>
                    {l.bids.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: '#9c94bd' }}>No bids on this lot.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 5 }}>
                        {l.bids.map((b, i) => (
                          <div key={`${b.addr}-${b.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                            <Avatar seed={b.seed} size={20} />
                            <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.name || shortAddress(b.addr)}
                            </span>
                            {i === l.bids.length - 1 && (
                              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: '#6b6d78', background: '#efeafd', padding: '2px 6px', borderRadius: 999 }}>
                                OPENING
                              </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontFamily: "'Archivo',sans-serif", fontWeight: 800 }}>
                              {formatAmount(b.amount)}
                            </span>
                            <span style={{ color: '#c9c3dd', fontSize: 11.5, minWidth: 62, textAlign: 'right' }}>
                              {new Date(b.at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p style={{ margin: '22px 0 0', fontSize: 12.5, color: '#9c94bd', lineHeight: 1.6 }}>
        This is a free room, so there are no transactions to link — nothing here
        touched a chain and no MON moved. For a ledger you can verify on the
        explorer, host a MON room instead.
      </p>
    </Shell>
  )
}

function Shell({ code, title, closed, children }) {
  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff,#eceaf6)' }}>
      <header style={{ background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href={`/f/${code}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <BidBlitzMark size={26} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16, color: '#12121c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {title || 'Room history'}
              </span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.14em' }}>
                {code}{closed ? ' · ENDED' : ''}
              </span>
            </span>
          </Link>
          <a href={`/f/${code}/screen`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#6b6d78' }}>
            Screen ↗
          </a>
        </div>
      </header>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '22px 18px 60px' }}>{children}</div>
    </main>
  )
}
