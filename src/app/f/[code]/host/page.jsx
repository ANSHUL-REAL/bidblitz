'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { Avatar } from '../../../../components/Avatar'
import { useCountdown } from '../../../../lib/useAuction'
import { useFreeState, useFreeHost } from '../../../../lib/useFreeRoom'
import { normalizeCode, DEFAULT_DURATION, loadHostToken } from '../../../../lib/freeRoom.mjs'
import { formatAmount, entityLabel, entityColor, shortAddress } from '../../../../lib/format.mjs'
import { itemsForCategories, FANTASY_ITEMS } from '../../../../lib/categories.mjs'
import { imageForItem } from '../../../../lib/presetArt.mjs'
import { sanitizeLotName } from '../../../../lib/lots.mjs'

/**
 * Host console for a FREE room.
 *
 * The old version showed the live lot and nothing else, which is exactly the
 * information a host does NOT need — they can see the lot on the projector
 * behind them. What they cannot see is who is actually in the room, who has
 * bid, and what everyone has left to spend. So the console is built around
 * those three, with SELL sitting next to the standings rather than on its own
 * screen: selling and deciding what to run next are one motion, not two.
 *
 * No gas, no wallet, no transaction to wait on. Pressing SELL is a POST that
 * either worked or did not.
 */
export default function FreeHost({ params }) {
  const { code: raw } = use(params)
  const code = normalizeCode(raw)

  const { state, error, refetch } = useFreeState({ code, live: true, full: true, intervalMs: 700 })
  const host = useFreeHost(code)
  const [hasToken, setHasToken] = useState(null)

  // localStorage is unavailable during SSR, so this can only be decided after
  // mount — null means "still checking", not "not the host".
  useEffect(() => { setHasToken(Boolean(loadHostToken(code))) }, [code])

  if (error === 'room not found') {
    return <Blocked title={`No room ${code}`} body="Check the code on the big screen." />
  }
  if (hasToken === false) {
    return (
      <Blocked
        title="Not your room"
        body="Free rooms are run from the browser that created them, and this isn't it. You can still join and bid."
        action={{ href: `/f/${code}`, label: 'Go bid instead' }}
      />
    )
  }
  if (hasToken === null) return null

  return <Console code={code} state={state} host={host} refetch={refetch} />
}

function Console({ code, state, host, refetch }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const isOpen = Number(state?.openLotId || 0) !== 0
  const live = isOpen && remaining > 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = live && remaining <= 5
  const closed = Boolean(state?.closed)
  const players = state?.players ?? []
  const bids = state?.bids ?? []

  const leaderName = state?.bidder
    ? players.find((p) => p.addr === state.bidder)?.name || shortAddress(state.bidder)
    : null

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

  return (
    <main style={{ minHeight: '100dvh', background: '#f1f0f9', paddingBottom: 60 }}>
      <Header code={code} state={state} closed={closed} />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 16px 0' }}>
        {closed ? (
          <FinalStandings players={players} />
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)' }} className="host-grid">
            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <LiveLot
                state={state} remaining={remaining} live={live} isOpen={isOpen}
                urgent={urgent} highest={highest} leaderName={leaderName}
                busy={busy} run={run} host={host}
              />
              {isOpen && <BidLedger bids={bids} highest={highest} />}
              {!isOpen && <StartLot state={state} busy={busy} run={run} host={host} setMsg={setMsg} />}
            </div>

            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <Standings
                players={players} leadAddr={state?.bidder} busy={busy}
                onKick={(addr, name) => run(() => host.kickPlayer(addr), `Removed ${name || 'player'}`)}
              />
              <EndRoom
                confirmEnd={confirmEnd} setConfirmEnd={setConfirmEnd} busy={busy}
                onEnd={() => run(() => host.endRoom(), 'Auction ended')}
              />
            </div>
          </div>
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

      {/* Two columns once there's room for them; stacked on the phone a host
          is actually holding while they narrate. */}
      <style>{`
        @media (min-width: 900px) {
          .host-grid { grid-template-columns: minmax(0,1.35fr) minmax(0,1fr) !important; }
        }
      `}</style>
    </main>
  )
}

function Header({ code, state, closed }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px', background: '#fff', position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 1px 0 rgba(18,18,28,.06)', gap: 12,
      }}
    >
      <Link href={`/f/${code}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <BidBlitzMark size={26} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 16, color: '#12121c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>
            {state?.rname || 'Room'}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.14em' }}>
            {code}{closed ? ' · ENDED' : ''}
          </span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
        <Link href={`/f/${code}/screen`} style={{ fontSize: 13, fontWeight: 700, color: '#6b6d78' }}>Screen</Link>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: '#6b2de6' }}>HOST</span>
      </div>
    </header>
  )
}

/** What is on the block right now, and the one button that matters. */
function LiveLot({ state, remaining, live, isOpen, urgent, highest, leaderName, busy, run, host }) {
  const pct = live && state?.duration ? (remaining / state.duration) * 100 : null

  return (
    <section
      style={{
        background: '#fff', borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 18px 50px rgba(30,20,70,.08)',
        border: `2px solid ${isOpen ? (urgent ? '#ff4d4d' : '#6b2de6') : '#eeecf7'}`,
        transition: 'border-color .3s ease',
      }}
    >
      {isOpen && (
        <div style={{ height: 6, background: '#eeecf7' }}>
          <div
            style={{
              height: '100%', width: `${Math.max(0, Math.min(100, pct ?? (remaining / 30) * 100))}%`,
              background: urgent ? '#ff4d4d' : '#6b2de6', transition: 'width .2s linear',
            }}
          />
        </div>
      )}

      <div style={{ padding: 20 }}>
        {isOpen ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 800 }}>
                LOT #{state.lotId} · LIVE
              </span>
              <span
                style={{
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 30,
                  color: urgent ? '#ff4d4d' : '#12121c', lineHeight: 1,
                }}
              >
                {Math.max(0, remaining)}s
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
              {state.limage && (
                <img
                  src={state.limage} alt=""
                  style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: '-.03em', lineHeight: 1.05 }}>
                  {state.lname}
                </div>
                <div style={{ fontSize: 14.5, color: '#6b6d78', marginTop: 3 }}>
                  {highest === 0n
                    ? 'No bids yet'
                    : <><strong style={{ color: '#12121c' }}>{formatAmount(highest)} PTS</strong> · {leaderName} leading</>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                className="btn-plain" disabled={busy}
                onClick={() => run(() => host.sellLot(state.lotId), highest === 0n ? 'Closed — no bids' : `Sold to ${leaderName}`)}
                style={{
                  flex: 2, padding: '20px 0', borderRadius: 15, background: '#12703a', color: '#fff',
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 21, letterSpacing: '.08em',
                  boxShadow: '0 14px 30px rgba(18,112,58,.28)', opacity: busy ? .6 : 1,
                }}
              >
                SELL
              </button>
              <button
                className="btn-plain" disabled={busy}
                onClick={() => run(() => host.closeLot(), 'Lot cancelled — nobody charged')}
                style={{
                  flex: 1, padding: '20px 0', borderRadius: 15, border: '2px solid #eeecf7',
                  background: '#fff', color: '#6b6d78', fontWeight: 700, fontSize: 15,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 800 }}>
              {state?.lotId ? `LOT #${state.lotId} FINISHED` : 'NOTHING LIVE YET'}
            </div>
            {state?.lotId ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '-.02em' }}>
                  {state.lname}
                </div>
                <div style={{ fontSize: 15, color: highest > 0n ? '#12703a' : '#6b6d78', marginTop: 3, fontWeight: highest > 0n ? 700 : 400 }}>
                  {highest > 0n ? `Sold for ${formatAmount(highest)} PTS to ${leaderName}` : 'Went unsold'}
                </div>
              </div>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: 15, color: '#6b6d78', lineHeight: 1.5 }}>
                Put something on the block. Free rooms cost nothing, so run as many as you like.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * Every bid on the live lot, newest first.
 *
 * A host narrating an auction reads this out loud — so it keeps repeat bids
 * from the same person rather than collapsing to the best one like the race
 * track does, and it ends on the opening bid so the whole arc is visible.
 */
function BidLedger({ bids, highest }) {
  return (
    <section style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 18px 50px rgba(30,20,70,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 800 }}>
          BIDS THIS LOT
        </span>
        <span style={{ fontSize: 12.5, color: '#9c94bd' }}>{bids.length} total</span>
      </div>

      {bids.length === 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#9c94bd' }}>
          Nothing yet — the room is still deciding.
        </p>
      ) : (
        <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 6 }}>
          {bids.map((b, i) => {
            const top = BigInt(b.amount) === highest && i === 0
            const opening = i === bids.length - 1
            return (
              <div
                key={`${b.bidder}-${b.at}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 11px', borderRadius: 10,
                  background: top ? '#e9f9ef' : '#fbfaff',
                  border: `1px solid ${top ? '#bfe8cf' : '#f0edfa'}`,
                }}
              >
                <Avatar seed={b.bidder} size={26} />
                <span style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name || shortAddress(b.bidder)}
                </span>
                {opening && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#6b6d78', background: '#efeafd', padding: '2px 6px', borderRadius: 999 }}>
                    OPENING
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16, color: top ? '#12703a' : '#12121c' }}>
                  {formatAmount(b.amount)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Who is in the room, what they have left, and the way to remove someone. */
function Standings({ players, leadAddr, busy, onKick }) {
  const [confirm, setConfirm] = useState(null)

  const sorted = useMemo(
    () => [...players].sort((a, b) =>
      (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1)),
    [players],
  )

  return (
    <section style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 18px 50px rgba(30,20,70,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 800 }}>
          IN THE ROOM
        </span>
        <span style={{ fontSize: 12.5, color: '#9c94bd' }}>{players.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#9c94bd', lineHeight: 1.5 }}>
          Nobody yet. Put the big screen up — the QR is on it.
        </p>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
          {sorted.map((p) => {
            const leading = leadAddr && p.addr === leadAddr
            const asking = confirm === p.addr
            return (
              <div
                key={p.addr}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11,
                  background: leading ? '#f3eeff' : '#fbfaff',
                  border: `1px solid ${leading ? '#ddd0fa' : '#f0edfa'}`,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, transform: 'rotate(45deg)', background: entityColor(p.entityId), flexShrink: 0 }} />
                <Avatar seed={p.avatarSeed || p.addr} size={28} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || entityLabel(p.entityId)}
                    {p.wins > 0 && <span style={{ marginLeft: 6, fontSize: 11.5, color: '#12703a', fontWeight: 800 }}>{p.wins}W</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b6d78' }}>
                    {formatAmount(p.purse)} left · {formatAmount(p.spent)} spent
                  </div>
                </div>

                {asking ? (
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button
                      className="btn-plain" disabled={busy}
                      onClick={() => { setConfirm(null); onKick(p.addr, p.name) }}
                      style={{ padding: '6px 9px', borderRadius: 8, background: '#c0392b', color: '#fff', fontWeight: 800, fontSize: 12 }}
                    >
                      Remove
                    </button>
                    <button
                      className="btn-plain" onClick={() => setConfirm(null)}
                      style={{ padding: '6px 9px', borderRadius: 8, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 12 }}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn-plain" title="Remove from room"
                    onClick={() => setConfirm(p.addr)}
                    style={{ padding: '6px 9px', borderRadius: 8, background: 'transparent', color: '#bdb4d6', fontWeight: 800, fontSize: 15, lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/**
 * Starting the next lot.
 *
 * Rebuilt around the one-tap grid rather than the text field: a host mid-event
 * is choosing from things they already set up, not typing. The custom field is
 * still there, below, for when they want something not on the list.
 */
function StartLot({ state, busy, run, host, setMsg }) {
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [custom, setCustom] = useState(false)

  const isFantasy = Number(state?.mode) === 1
  const catItems = useMemo(
    () => (isFantasy ? FANTASY_ITEMS : itemsForCategories(state?.categories?.length ? state.categories : ['memes'])),
    [isFantasy, state?.categories],
  )

  const start = (lotName, lotImage) => {
    const clean = sanitizeLotName(lotName)
    if (!clean) return setMsg({ ok: false, text: 'Name required' })
    return run(() => host.startLot(clean, lotImage || '', duration), `Started: ${clean}`)
      .then(() => { setName(''); setImage('') })
  }

  return (
    <section style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 18px 50px rgba(30,20,70,.08)' }}>
      <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 800 }}>
        START THE NEXT LOT
      </div>

      <div style={{ display: 'flex', gap: 7, marginTop: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#6b6d78', fontWeight: 700, marginRight: 2 }}>Timer</span>
        {[10, 20, 30, 60].map((s) => (
          <button
            key={s} className="btn-plain" onClick={() => setDuration(s)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontWeight: 800, fontSize: 13.5,
              border: `2px solid ${duration === s ? '#6b2de6' : '#e6e2f5'}`,
              background: duration === s ? '#efeafd' : '#fff',
              color: duration === s ? '#5b28d9' : '#6b6d78',
            }}
          >
            {s}s
          </button>
        ))}
      </div>

      {catItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(104px,1fr))', gap: 8, marginTop: 14 }}>
          {catItems.slice(0, 24).map((item) => {
            const label = typeof item === 'string' ? item : item.name
            const art = imageForItem(label)
            return (
              <button
                key={label} className="btn-plain" disabled={busy}
                onClick={() => start(label, art)}
                style={{
                  padding: 0, borderRadius: 13, overflow: 'hidden', border: '1px solid #e6e2f5',
                  background: '#fbfaff', textAlign: 'left', opacity: busy ? .55 : 1,
                }}
              >
                <div style={{ height: 62, background: '#efeafd', position: 'relative' }}>
                  {art && (
                    <img
                      src={art} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
                <div style={{ padding: '8px 9px', fontSize: 12.5, fontWeight: 700, color: '#2a2a3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {label}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!custom ? (
        <button
          className="btn-plain" onClick={() => setCustom(true)}
          style={{ width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 11, border: '2px dashed #ddd6f3', background: '#fff', color: '#5b28d9', fontWeight: 700, fontSize: 13.5 }}
        >
          + Something else
        </button>
      ) : (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 13, background: '#fbfaff', border: '1px solid #eeecf7' }}>
          <input
            className="field" value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="What's on the block?" maxLength={60}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) start(name, image) }}
          />
          <input
            className="field" style={{ marginTop: 8, fontSize: 13.5 }} value={image}
            onChange={(e) => setImage(e.target.value)} placeholder="Image URL (optional)" maxLength={500}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn-plain" disabled={busy || !name.trim()}
              onClick={() => start(name, image)}
              style={{
                flex: 2, padding: '14px 0', borderRadius: 11,
                background: name.trim() ? '#6b2de6' : '#eeecf7',
                color: name.trim() ? '#fff' : '#a08fd0', fontWeight: 800, fontSize: 15,
              }}
            >
              Start it
            </button>
            <button
              className="btn-plain" onClick={() => setCustom(false)}
              style={{ flex: 1, padding: '14px 0', borderRadius: 11, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function EndRoom({ confirmEnd, setConfirmEnd, busy, onEnd }) {
  return (
    <section style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 18px 50px rgba(30,20,70,.08)' }}>
      {!confirmEnd ? (
        <button
          className="btn-plain" onClick={() => setConfirmEnd(true)}
          style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: '2px solid #f2d6d2', background: '#fff', color: '#c0392b', fontWeight: 800, fontSize: 14.5 }}
        >
          End this auction
        </button>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13.5, color: '#6b6d78', lineHeight: 1.5 }}>
            Ends the room for everyone and shows the final standings. Anything still
            live is cancelled, not sold — <strong>nobody gets charged</strong>. This
            can&apos;t be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn-plain" disabled={busy} onClick={onEnd}
              style={{ flex: 1, padding: '13px 0', borderRadius: 11, background: '#c0392b', color: '#fff', fontWeight: 800, fontSize: 14.5 }}
            >
              End it
            </button>
            <button
              className="btn-plain" onClick={() => setConfirmEnd(false)}
              style={{ flex: 1, padding: '13px 0', borderRadius: 11, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 14 }}
            >
              Keep going
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** The result screen. A session that just stops has no ending; this gives it one. */
function FinalStandings({ players }) {
  const sorted = [...players].sort((a, b) =>
    (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1))
  const champ = sorted[0]

  return (
    <section style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 18px 50px rgba(30,20,70,.08)', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 800 }}>AUCTION ENDED</div>
        {champ && champ.wins > 0 ? (
          <>
            <div style={{ marginTop: 14 }}><Avatar seed={champ.avatarSeed || champ.addr} size={72} /></div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: '-.03em', marginTop: 10 }}>
              {champ.name || entityLabel(champ.entityId)}
            </div>
            <div style={{ fontSize: 15, color: '#12703a', fontWeight: 700 }}>
              {champ.wins} lot{champ.wins === 1 ? '' : 's'} won
            </div>
          </>
        ) : (
          <p style={{ fontSize: 16, color: '#6b6d78', margin: '14px 0 0' }}>No lots were sold.</p>
        )}
      </div>

      <div style={{ marginTop: 22, display: 'grid', gap: 7 }}>
        {sorted.map((p, i) => (
          <div
            key={p.addr}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11,
              background: i === 0 ? '#f3eeff' : '#fbfaff', border: '1px solid #f0edfa',
            }}
          >
            <span style={{ width: 20, fontFamily: "'DM Mono',monospace", fontSize: 13, color: '#9c94bd', fontWeight: 700 }}>{i + 1}</span>
            <Avatar seed={p.avatarSeed || p.addr} size={30} />
            <span style={{ fontWeight: 700, fontSize: 14.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name || entityLabel(p.entityId)}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b6d78' }}>
              {formatAmount(p.spent)} spent
            </span>
            <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 17, color: p.wins ? '#12703a' : '#c9c3dd', minWidth: 28, textAlign: 'right' }}>
              {p.wins}
            </span>
          </div>
        ))}
      </div>
    </section>
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
