'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { roomIdFromCode } from '../../../../lib/room.mjs'
import { formatMon, shortAddress } from '../../../../lib/format.mjs'
import { txUrl } from '../../../../lib/chain.mjs'
import { useParticipants } from '../../../../lib/useParticipants'

/**
 * Live, chain-derived transaction history for a room. Open to everyone — host
 * and bidders alike — so the whole room can watch the ledger fill up, and so a
 * host can put it on screen as proof. Every row links to the real transaction.
 */
export default function History({ params }) {
  const { code } = use(params)
  const roomId = roomIdFromCode(code)
  const participants = useParticipants(code)
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!roomId) return
    let alive = true
    const load = () =>
      fetch(`/api/history?room=${roomId}`)
        .then((r) => r.json())
        .then((d) => { if (alive) { if (d.events) setRows(d.events); if (d.error) setErr(d.error) } })
        .catch(() => {})
    load()
    const id = setInterval(load, 2500)
    return () => { alive = false; clearInterval(id) }
  }, [roomId])

  const nameFor = (addr) =>
    participants.get(String(addr || '').toLowerCase())?.name || shortAddress(addr)

  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff,#eceaf6)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link href={`/r/${code}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BidBlitzMark size={26} />
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17 }}>Transaction history</span>
        </Link>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.12em' }}>{code?.toUpperCase()}</span>
          <Link href={`/r/${code}/leaderboard`} style={{ fontSize: 13, fontWeight: 700, color: '#6b6d78' }}>Board</Link>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
        <p style={{ fontSize: 13, color: '#6b6d78', margin: '0 0 14px' }}>
          Live from the Monad chain — every row is a real transaction you can open on the explorer.
        </p>

        {err && <p style={{ color: '#c0392b', fontSize: 14 }}>{err}</p>}
        {!rows.length && !err && <p style={{ color: '#9c94bd', fontSize: 15 }}>No transactions yet.</p>}

        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <Row key={`${r.txHash}-${r.logIndex}`} r={r} nameFor={nameFor} />
          ))}
        </div>
      </div>
    </main>
  )
}

const KIND = {
  BidPlaced:  { dot: '#6b2de6', verb: 'bid' },
  LotSold:    { dot: '#12703a', verb: 'won' },
  LotUnsold:  { dot: '#9c94bd', verb: 'unsold' },
  AwaitingPayment: { dot: '#c98a00', verb: 'awaiting payment' },
  LotPaid:    { dot: '#12703a', verb: 'paid' },
  LotDefaulted: { dot: '#c0392b', verb: 'not paid' },
  Withdrawn:  { dot: '#0e7490', verb: 'withdrew' },
  LotStarted: { dot: '#5b28d9', verb: 'lot opened' },
  Joined:     { dot: '#8d85b4', verb: 'joined' },
}

function Row({ r, nameFor }) {
  const k = KIND[r.kind] || { dot: '#9c94bd', verb: r.kind }
  const a = r.args || {}
  let text = null
  if (r.kind === 'BidPlaced') text = <><b>{nameFor(a.bidder)}</b> bid <b>{formatMon(a.amount)}</b> on lot #{a.lotId}</>
  else if (r.kind === 'LotSold') text = <><b>{nameFor(a.winner)}</b> won <b>{a.name || `lot #${a.lotId}`}</b> for <b>{formatMon(a.amount)}</b></>
  else if (r.kind === 'LotUnsold') text = <><b>{a.name || `Lot #${a.lotId}`}</b> went unsold</>
  else if (r.kind === 'AwaitingPayment') text = <><b>{nameFor(a.winner)}</b> won lot #{a.lotId} — owes <b>{formatMon(a.amount)}</b></>
  else if (r.kind === 'LotPaid') text = <><b>{nameFor(a.winner)}</b> paid <b>{formatMon(a.amount)}</b> for lot #{a.lotId}</>
  else if (r.kind === 'LotDefaulted') text = <><b>{nameFor(a.winner)}</b> never paid <b>{formatMon(a.amount)}</b> — lot #{a.lotId} released</>
  else if (r.kind === 'Withdrawn') text = <><b>{nameFor(a.who)}</b> withdrew <b>{formatMon(a.amount)}</b> to their wallet</>
  else if (r.kind === 'LotStarted') text = <>Lot <b>{a.name || `#${a.lotId}`}</b> opened</>
  else if (r.kind === 'Joined') text = <><b>{nameFor(a.who)}</b> joined</>
  else text = <>{r.kind}</>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#fff', borderRadius: 12, border: '1px solid #eeecf7' }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: k.dot, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: '#2a2a3a' }}>{text}</span>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: '#9c94bd' }}>#{r.block}</span>
      <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#6b2de6', textDecoration: 'none', flexShrink: 0 }}>
        tx ↗
      </a>
    </div>
  )
}
