'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { Avatar } from '../../../../components/Avatar'
import { useCountdown, formatCountdown } from '../../../../lib/useAuction'
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

/**
 * One viewport, no page scroll, standings always on screen.
 *
 * A host is standing in front of a room narrating an auction — they cannot
 * hunt for a panel or scroll to find who is winning. So the page is locked to
 * the viewport height and the two things they read constantly (the bid ledger
 * and the standings) sit side by side underneath the lot, each scrolling
 * INSIDE itself. Nothing important can end up below the fold.
 *
 * The right-hand column never changes contents. The left swaps between the
 * live bid ledger and the start-next-lot picker, because those two are never
 * needed at the same moment.
 */
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

  if (closed) {
    return (
      <main style={{ height: '100dvh', overflow: 'hidden', background: '#f1f0f9', display: 'flex', flexDirection: 'column' }}>
        <Header code={code} state={state} closed onEnd={null} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
          <FinalStandings players={players} />
        </div>
      </main>
    )
  }

  return (
    <main style={{ height: '100dvh', overflow: 'hidden', background: '#f1f0f9', display: 'flex', flexDirection: 'column' }}>
      <Header
        code={code} state={state} closed={false}
        onEnd={() => setConfirmEnd(true)}
      />

      <div
        style={{
          flex: 1, minHeight: 0, width: '100%', maxWidth: 1080, margin: '0 auto',
          padding: '10px 10px 10px', display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <LiveLot
          state={state} remaining={remaining} live={live} isOpen={isOpen}
          urgent={urgent} highest={highest} leaderName={leaderName}
          busy={busy} run={run} host={host}
        />

        {/* The two panels a host reads constantly, side by side and never
            below the fold. Each scrolls inside itself. */}
        <div
          style={{
            flex: 1, minHeight: 0, display: 'grid', gap: 10,
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
          }}
        >
          {isOpen
            ? <BidLedger bids={bids} highest={highest} />
            : <StartLot state={state} busy={busy} run={run} host={host} setMsg={setMsg} />}

          <Standings
            players={players} leadAddr={state?.bidder} busy={busy}
            onKick={(addr, name) => run(() => host.kickPlayer(addr), `Removed ${name || 'player'}`)}
          />
        </div>

        {msg && (
          <p
            style={{
              flexShrink: 0, margin: 0, padding: '9px 12px', borderRadius: 10,
              fontSize: 13, fontWeight: 600, textAlign: 'center',
              background: msg.ok ? '#e9f9ef' : '#fdecea', color: msg.ok ? '#12703a' : '#c0392b',
            }}
          >
            {msg.text}
          </p>
        )}
      </div>

      {confirmEnd && (
        <EndRoomDialog
          busy={busy}
          onCancel={() => setConfirmEnd(false)}
          onEnd={() => { setConfirmEnd(false); run(() => host.endRoom(), 'Auction ended') }}
        />
      )}
    </main>
  )
}

/**
 * Ending the room is rare and destructive, so it lives in a dialog rather than
 * taking permanent space next to the controls a host uses every lot.
 */
function EndRoomDialog({ busy, onCancel, onEnd }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(18,18,28,.55)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 380, width: '100%' }}
      >
        <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-.02em' }}>
          End this auction?
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6b6d78', lineHeight: 1.5 }}>
          Everyone sees the final standings. Anything still live is cancelled, not
          sold — <strong>nobody gets charged</strong>. This can&apos;t be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            className="btn-plain" disabled={busy} onClick={onEnd}
            style={{ flex: 1, padding: '13px 0', borderRadius: 11, background: '#c0392b', color: '#fff', fontWeight: 800, fontSize: 14.5 }}
          >
            End it
          </button>
          <button
            className="btn-plain" onClick={onCancel}
            style={{ flex: 1, padding: '13px 0', borderRadius: 11, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 14 }}
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

function Header({ code, state, closed, onEnd }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#fff', flexShrink: 0, zIndex: 20,
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <Link href={`/f/${code}/screen`} style={{ fontSize: 12.5, fontWeight: 700, color: '#6b6d78' }}>Screen</Link>
        {onEnd && (
          <button
            className="btn-plain" onClick={onEnd}
            style={{ padding: '7px 11px', borderRadius: 9, border: '1.5px solid #f2d6d2', background: '#fff', color: '#c0392b', fontWeight: 800, fontSize: 12.5 }}
          >
            End
          </button>
        )}
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
        flexShrink: 0, background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(30,20,70,.07)',
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

      <div style={{ padding: 14 }}>
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
                {formatCountdown(remaining)}s
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
              {state.limage && (
                <img
                  src={state.limage} alt=""
                  style={{ width: 46, height: 46, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-.03em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {state.lname}
                </div>
                <div style={{ fontSize: 13, color: '#6b6d78', marginTop: 2 }}>
                  {highest === 0n
                    ? 'No bids yet'
                    : <><strong style={{ color: '#12121c' }}>{formatAmount(highest)} PTS</strong> · {leaderName} leading</>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
              <button
                className="btn-plain" disabled={busy}
                onClick={() => run(() => host.sellLot(state.lotId), highest === 0n ? 'Closed — no bids' : `Sold to ${leaderName}`)}
                style={{
                  flex: 2, padding: '16px 0', borderRadius: 13, background: '#12703a', color: '#fff',
                  fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: '.08em',
                  boxShadow: '0 10px 22px rgba(18,112,58,.26)', opacity: busy ? .6 : 1,
                }}
              >
                SELL
              </button>
              <button
                className="btn-plain" disabled={busy}
                onClick={() => run(() => host.closeLot(), 'Lot cancelled — nobody charged')}
                style={{
                  flex: 1, padding: '16px 0', borderRadius: 13, border: '2px solid #eeecf7',
                  background: '#fff', color: '#6b6d78', fontWeight: 700, fontSize: 14,
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
                <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: '-.02em' }}>
                  {state.lname}
                </div>
                <div style={{ fontSize: 13.5, color: highest > 0n ? '#12703a' : '#6b6d78', marginTop: 2, fontWeight: highest > 0n ? 700 : 400 }}>
                  {highest > 0n ? `Sold for ${formatAmount(highest)} PTS to ${leaderName}` : 'Went unsold'}
                </div>
              </div>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6b6d78', lineHeight: 1.45 }}>
                Put something on the block — pick one on the left.
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
    <section
      style={{
        background: '#fff', borderRadius: 16, padding: 13, boxShadow: '0 10px 30px rgba(30,20,70,.07)',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800 }}>
          BIDS
        </span>
        <span style={{ fontSize: 12.5, color: '#9c94bd' }}>{bids.length} total</span>
      </div>

      {bids.length === 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#9c94bd' }}>
          Nothing yet — the room is still deciding.
        </p>
      ) : (
        <div style={{ marginTop: 8, flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 5, alignContent: 'start' }}>
          {bids.map((b, i) => {
            const top = BigInt(b.amount) === highest && i === 0
            const opening = i === bids.length - 1
            return (
              <div
                key={`${b.bidder}-${b.at}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                  padding: '7px 8px', borderRadius: 9,
                  background: top ? '#e9f9ef' : '#fbfaff',
                  border: `1px solid ${top ? '#bfe8cf' : '#f0edfa'}`,
                }}
              >
                <Avatar seed={b.bidder} size={22} />
                <span style={{ fontWeight: 700, fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name || shortAddress(b.bidder)}
                </span>
                {opening && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#6b6d78', background: '#efeafd', padding: '2px 6px', borderRadius: 999 }}>
                    OPENING
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 14, color: top ? '#12703a' : '#12121c' }}>
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
    <section
      style={{
        background: '#fff', borderRadius: 16, padding: 13, boxShadow: '0 10px 30px rgba(30,20,70,.07)',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800 }}>
          IN THE ROOM
        </span>
        <span style={{ fontSize: 12.5, color: '#9c94bd' }}>{players.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 14, color: '#9c94bd', lineHeight: 1.5 }}>
          Nobody yet. Put the big screen up — the QR is on it.
        </p>
      ) : (
        <div style={{ marginTop: 8, flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 5, alignContent: 'start' }}>
          {sorted.map((p) => {
            const leading = leadAddr && p.addr === leadAddr
            const asking = confirm === p.addr
            return (
              <div
                key={p.addr}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 9, flexShrink: 0,
                  background: leading ? '#f3eeff' : '#fbfaff',
                  border: `1px solid ${leading ? '#ddd0fa' : '#f0edfa'}`,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, transform: 'rotate(45deg)', background: entityColor(p.entityId), flexShrink: 0 }} />
                <Avatar seed={p.avatarSeed || p.addr} size={22} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || entityLabel(p.entityId)}
                    {p.wins > 0 && <span style={{ marginLeft: 5, fontSize: 10.5, color: '#12703a', fontWeight: 800 }}>{p.wins}W</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b6d78' }}>
                    {formatAmount(p.purse)} left
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
    <section
      style={{
        background: '#fff', borderRadius: 16, padding: 13, boxShadow: '0 10px 30px rgba(30,20,70,.07)',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800, flexShrink: 0 }}>
        NEXT LOT
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 9, alignItems: 'center', flexShrink: 0 }}>
        {[10, 20, 30, 60].map((s) => (
          <button
            key={s} className="btn-plain" onClick={() => setDuration(s)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 9, fontWeight: 800, fontSize: 12,
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 7, marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto', alignContent: 'start' }}>
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
                <div style={{ height: 46, background: '#efeafd', position: 'relative' }}>
                  {art && (
                    <img
                      src={art} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
                <div style={{ padding: '6px 7px', fontSize: 11, fontWeight: 700, color: '#2a2a3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          style={{ flexShrink: 0, width: '100%', marginTop: 9, padding: '10px 0', borderRadius: 10, border: '2px dashed #ddd6f3', background: '#fff', color: '#5b28d9', fontWeight: 700, fontSize: 12.5 }}
        >
          + Something else
        </button>
      ) : (
        <div style={{ flexShrink: 0, marginTop: 10, padding: 11, borderRadius: 12, background: '#fbfaff', border: '1px solid #eeecf7' }}>
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
