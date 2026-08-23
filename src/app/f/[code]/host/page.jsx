'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../../components/Logo'
import { Avatar } from '../../../../components/Avatar'
import { InviteCard, InviteDialog, useRoomUrl } from '../../../../components/InviteCard'
import { useCountdown, formatCountdown } from '../../../../lib/useAuction'
import { useFreeState, useFreeHost, useBots } from '../../../../lib/useFreeRoom'
import { normalizeCode, DEFAULT_DURATION, loadHostToken } from '../../../../lib/freeRoom.mjs'
import { formatAmount, entityLabel, entityColor, shortAddress } from '../../../../lib/format.mjs'
import { itemsForCategories, FANTASY_ITEMS } from '../../../../lib/categories.mjs'
import { imageForItem } from '../../../../lib/presetArt.mjs'
import { sanitizeLotName } from '../../../../lib/lots.mjs'
import { uploadImage } from '../../../../lib/supabase'

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
  const [mirror, setMirror] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  // Off unless the host turns it on. Nothing adds bots by itself.
  const [botsOn, setBotsOn] = useState(false)
  const [invite, setInvite] = useState(false)
  const joinUrl = useRoomUrl(`/f/${code}`)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const isOpen = Number(state?.openLotId || 0) !== 0
  const highest = BigInt(state?.highestBid || 0)
  const urgent = isOpen && remaining <= 5
  const closed = Boolean(state?.closed)

  const players = state?.players ?? []
  const bids = state?.bids ?? []
  const queue = state?.queue ?? []
  const results = state?.results ?? []
  const pending = queue.filter((q) => !q.lotId)

  const leaderName = state?.bidder
    ? players.find((p) => p.addr === state.bidder)?.name || shortAddress(state.bidder)
    : null

  const bots = players.filter((p) => p.bot)
  useBots({ code, state, token: loadHostToken(code), enabled: botsOn && bots.length > 0 })

  // Three states, and the host only ever needs the one they are in: still
  // setting up, a lot running, or a lot just finished with more to come.
  const justFinished = !closed && !isOpen && Number(state?.lotId || 0) > 0

  async function run(fn, label) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg(label ? { ok: true, text: label } : null)
      setTimeout(refetch, 200)
    } catch (err) {
      setMsg({ ok: false, text: String(err?.message || err).slice(0, 160) })
    } finally {
      setBusy(false)
    }
  }

  if (closed) {
    return (
      <main style={SHELL}>
        <Header code={code} state={state} closed onEnd={null} onMirror={null} onInvite={null} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
          <FinalResults results={results} players={players} />
        </div>
      </main>
    )
  }

  return (
    <main style={SHELL}>
      <Header
        code={code} state={state} closed={false}
        onEnd={() => setConfirmEnd(true)} onMirror={() => setMirror(true)}
        onInvite={() => setInvite(true)}
      />

      <div className="stage" style={STAGE}>
        <div style={{ display: 'grid', gap: 10, minHeight: 0, gridTemplateRows: 'auto minmax(0,1fr)' }}>
          {isOpen ? (
            <LiveLot
              state={state} remaining={remaining} urgent={urgent} highest={highest}
              leaderName={leaderName} busy={busy} run={run} host={host}
            />
          ) : justFinished ? (
            <SoldCard
              state={state} highest={highest} leaderName={leaderName}
              nextItem={pending[0]} busy={busy}
              onContinue={() => run(() => host.startNext(duration), null)}
              onEnd={() => setConfirmEnd(true)}
            />
          ) : (
            <SetupCard
              count={pending.length} busy={busy} duration={duration} setDuration={setDuration}
              onStart={() => run(() => host.startNext(duration), null)}
              joinUrl={joinUrl} code={code} title={state?.rname}
            />
          )}

          {isOpen
            ? <BidLedger bids={bids} highest={highest} />
            : <QueuePanel
                queue={queue} busy={busy} state={state}
                onAdd={(name, image) => run(() => host.addItem(name, image), null)}
                onRemove={(id) => run(() => host.removeItem(id), null)}
              />}
        </div>

        <div style={{ display: 'grid', gap: 10, minHeight: 0, gridTemplateRows: 'minmax(0,1fr) auto' }}>
          <Leaderboard
            players={players} leadAddr={state?.bidder} busy={busy}
            onKick={(addr, name) => run(() => host.kickPlayer(addr), `Removed ${name || 'player'}`)}
          />
          <BotControls
            count={bots.length} on={botsOn} setOn={setBotsOn} busy={busy}
            onAdd={(n) => run(() => host.addBots(n), `${n} bot${n === 1 ? '' : 's'} added`)}
            onClear={() => { setBotsOn(false); run(() => host.clearBots(), 'Bots removed') }}
          />
        </div>
      </div>

      {msg && (
        <p style={{ ...TOAST, background: msg.ok ? '#efeafd' : '#fdecea', color: msg.ok ? '#5b28d9' : '#c0392b' }}>
          {msg.text}
        </p>
      )}

      {invite && (
        <InviteDialog url={joinUrl} code={code} title={state?.rname} onClose={() => setInvite(false)} />
      )}

      {mirror && <ScreenMirror code={code} onClose={() => setMirror(false)} />}

      {confirmEnd && (
        <EndRoomDialog
          busy={busy}
          onCancel={() => setConfirmEnd(false)}
          onEnd={() => { setConfirmEnd(false); run(() => host.endRoom(), 'Auction ended') }}
        />
      )}

      <style>{`
        @media (min-width: 900px) {
          .stage {
            grid-template-columns: minmax(0,1.4fr) minmax(0,1fr) !important;
            grid-template-rows: minmax(0,1fr) !important;
          }
        }
      `}</style>
    </main>
  )
}

const SHELL = {
  height: '100dvh', overflow: 'hidden', background: '#f1f0f9',
  display: 'flex', flexDirection: 'column',
}
// Stacked on a phone, the two panels have to SHARE the leftover height —
// auto rows sized them to their content and left the bottom third of the
// screen blank. minmax(0,1fr) lets each shrink and scroll internally instead.
const STAGE = {
  flex: 1, minHeight: 0, width: '100%', maxWidth: 1080, margin: '0 auto',
  padding: 10, display: 'grid', gap: 10,
  gridTemplateColumns: 'minmax(0,1fr)',
  gridTemplateRows: 'minmax(0,1.15fr) minmax(0,1fr)',
}
const CARD = { background: '#fff', borderRadius: 16, boxShadow: '0 10px 30px rgba(30,20,70,.07)' }
const PANEL = { ...CARD, padding: 13, display: 'flex', flexDirection: 'column', minHeight: 0 }
const LABEL = { fontSize: 10, letterSpacing: '.14em', color: '#6b6d78', fontWeight: 800, flexShrink: 0 }
const TOAST = {
  flexShrink: 0, margin: '0 10px 10px', padding: '9px 12px', borderRadius: 10,
  fontSize: 13, fontWeight: 600, textAlign: 'center',
}

/** Nothing has run yet: one button, and it says what it will do. */
function SetupCard({ count, busy, duration, setDuration, onStart, joinUrl, code, title }) {
  return (
    <section style={{ ...CARD, padding: 16, flexShrink: 0 }}>
      <div style={LABEL}>SET UP</div>
      <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 21, letterSpacing: '-.03em', marginTop: 4 }}>
        {count === 0 ? 'Add what you’re auctioning' : `${count} item${count === 1 ? '' : 's'} ready`}
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 13, color: '#6b6d78', lineHeight: 1.45 }}>
        {count === 0
          ? 'Build the list below — type your own or tap a preset. You can add more mid-auction.'
          : 'Put the big screen up so people can scan in, then start.'}
      </p>

      <div style={{ display: 'flex', gap: 5, marginTop: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6b6d78', fontWeight: 700, marginRight: 3 }}>Each lot</span>
        {[10, 20, 30, 60].map((sec) => (
          <button
            key={sec} className="btn-plain" onClick={() => setDuration(sec)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 9, fontWeight: 800, fontSize: 12,
              border: `2px solid ${duration === sec ? '#6b2de6' : '#e6e2f5'}`,
              background: duration === sec ? '#efeafd' : '#fff',
              color: duration === sec ? '#5b28d9' : '#6b6d78',
            }}
          >
            {sec}s
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f1fa' }}>
        <InviteCard url={joinUrl} code={code} title={title} compact />
      </div>

      <button
        className="btn-plain" disabled={busy || count === 0} onClick={onStart}
        style={{
          width: '100%', marginTop: 12, padding: '17px 0', borderRadius: 13,
          background: count === 0 ? '#eeecf7' : '#6b2de6',
          color: count === 0 ? '#a08fd0' : '#fff',
          fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: '.06em',
          boxShadow: count === 0 ? 'none' : '0 10px 24px rgba(107,45,230,.3)',
          opacity: busy ? .6 : 1,
        }}
      >
        START THE AUCTION →
      </button>
    </section>
  )
}

/**
 * The moment after a sale — the payoff of the whole lot.
 *
 * It says the thing out loud ("<item> sold to <name>") and then offers exactly
 * one way forward, with the NEXT item named on the button so the host knows
 * what they are about to announce before they press it.
 */
function SoldCard({ state, highest, leaderName, nextItem, busy, onContinue, onEnd }) {
  const nobody = highest === 0n || !leaderName
  return (
    <section style={{ ...CARD, padding: 16, flexShrink: 0, border: `2px solid ${nobody ? '#eeecf7' : '#ddd0fa'}` }}>
      <div style={LABEL}>LOT #{state.lotId} · {nobody ? 'UNSOLD' : 'SOLD'}</div>

      {nobody ? (
        <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-.03em', marginTop: 5 }}>
          {state.lname} — no bids
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '-.03em', marginTop: 5, lineHeight: 1.15 }}>
            {state.lname}
          </div>
          <div style={{ fontSize: 15, marginTop: 4, color: '#5b28d9', fontWeight: 700 }}>
            🎉 Sold to {leaderName} for {formatAmount(highest)} PTS
          </div>
        </>
      )}

      {nextItem ? (
        <button
          className="btn-plain" disabled={busy} onClick={onContinue}
          style={{
            width: '100%', marginTop: 14, padding: '16px 12px', borderRadius: 13,
            background: '#6b2de6', color: '#fff',
            fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 17, letterSpacing: '.04em',
            boxShadow: '0 10px 24px rgba(107,45,230,.3)', opacity: busy ? .6 : 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          CONTINUE → {nextItem.name}
        </button>
      ) : (
        <>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#6b6d78', lineHeight: 1.45 }}>
            That was the last item. Add another below, or finish and show the results.
          </p>
          <button
            className="btn-plain" disabled={busy} onClick={onEnd}
            style={{
              width: '100%', marginTop: 10, padding: '15px 0', borderRadius: 13,
              background: '#12121c', color: '#fff', fontFamily: "'Archivo',sans-serif",
              fontWeight: 900, fontSize: 16, letterSpacing: '.06em', opacity: busy ? .6 : 1,
            }}
          >
            FINISH & SHOW RESULTS
          </button>
        </>
      )}
    </section>
  )
}

/** The catalogue: what is coming, what already went, and how to add more. */
/**
 * The catalogue: what is coming, what already went, and how to add more.
 *
 * An item is a name and a picture, and the picture is most of the appeal on a
 * projector — so there are three ways to attach one and all of them show a
 * thumbnail before you commit: paste a URL, pick a file, or drop a file on the
 * panel. Presets stay available but are folded away, because a host with their
 * own photos should not have to scroll past someone else's memes to find the
 * field they actually want.
 */
function QueuePanel({ queue, busy, state, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [err, setErr] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const fileRef = useRef(null)

  const isFantasy = Number(state?.mode) === 1
  const presets = useMemo(
    () => (isFantasy ? FANTASY_ITEMS : itemsForCategories(state?.categories?.length ? state.categories : ['memes'])),
    [isFantasy, state?.categories],
  )

  const pending = queue.filter((q) => !q.lotId)
  const done = queue.filter((q) => q.lotId)

  const add = (n, img) => {
    const clean = sanitizeLotName(n)
    if (!clean) return
    onAdd(clean, img || '')
    setName(''); setImage(''); setErr('')
  }

  async function takeFile(file) {
    if (!file) return
    if (!file.type?.startsWith('image/')) return setErr('That file is not an image.')
    // 6MB: comfortably more than a phone photo, far less than something that
    // will stall the upload on venue wifi.
    if (file.size > 6 * 1024 * 1024) return setErr('Image is over 6MB — pick a smaller one.')
    setErr(''); setUploading(true)
    try {
      const url = await uploadImage(file)
      if (url) setImage(url)
      else setErr('Upload failed — paste a URL instead.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section
      style={{
        ...PANEL,
        outline: dragging ? '2px dashed #6b2de6' : 'none',
        outlineOffset: -4,
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        takeFile(e.dataTransfer?.files?.[0])
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={LABEL}>UP NEXT</span>
        <span style={{ fontSize: 12, color: '#9c94bd' }}>{pending.length} queued</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexShrink: 0 }}>
        <input
          className="field" value={name} style={{ flex: 1, fontSize: 13.5, padding: '10px 11px' }}
          onChange={(e) => setName(e.target.value)} placeholder="What's on the block?" maxLength={60}
          onKeyDown={(e) => { if (e.key === 'Enter') add(name, image) }}
        />
        <button
          className="btn-plain" disabled={busy || !name.trim()} onClick={() => add(name, image)}
          style={{
            padding: '0 15px', borderRadius: 10, fontWeight: 800, fontSize: 13.5,
            background: name.trim() ? '#6b2de6' : '#eeecf7', color: name.trim() ? '#fff' : '#a08fd0',
          }}
        >
          Add
        </button>
      </div>

      {/* --- picture: paste, pick, or drop --- */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexShrink: 0, alignItems: 'center' }}>
        {image ? (
          <img
            src={image} alt=""
            style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid #e6e2f5' }}
            onError={() => setErr('That URL did not load as an image.')}
          />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f3f1fa', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 15 }}>
            🖼
          </div>
        )}
        <input
          className="field" value={image} style={{ flex: 1, fontSize: 12, padding: '8px 10px' }}
          onChange={(e) => { setImage(e.target.value.trim()); setErr('') }}
          placeholder="Paste an image URL…" maxLength={500}
        />
        <button
          className="btn-plain" disabled={busy || uploading} onClick={() => fileRef.current?.click()}
          style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid #e6e2f5', background: '#fbfaff', fontWeight: 700, fontSize: 12, color: '#5b28d9', whiteSpace: 'nowrap' }}
        >
          {uploading ? '…' : 'Upload'}
        </button>
        {image && (
          <button
            className="btn-plain" onClick={() => { setImage(''); setErr('') }}
            title="Remove picture"
            style={{ padding: '8px 9px', borderRadius: 9, background: 'transparent', color: '#bdb4d6', fontWeight: 800, fontSize: 14, lineHeight: 1 }}
          >
            ×
          </button>
        )}
        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>

      {err && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#c0392b', flexShrink: 0 }}>{err}</p>}

      <div style={{ marginTop: 9, flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 5, alignContent: 'start' }}>
        {pending.map((q, i) => (
          <div
            key={q.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 9,
              background: i === 0 ? '#efeafd' : '#fbfaff',
              border: `1px solid ${i === 0 ? '#ddd0fa' : '#f0edfa'}`, flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: '#9c94bd', width: 14 }}>{i + 1}</span>
            {q.image ? (
              <img
                src={q.image} alt=""
                style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <span style={{ width: 26, height: 26, borderRadius: 6, background: '#efeafd', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>🖼</span>
            )}
            <span style={{ fontWeight: 700, fontSize: 12.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {q.name}
            </span>
            <button
              className="btn-plain" disabled={busy} onClick={() => onRemove(q.id)}
              title="Remove from queue"
              style={{ padding: '4px 7px', borderRadius: 7, background: 'transparent', color: '#bdb4d6', fontWeight: 800, fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}

        {pending.length === 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#9c94bd', lineHeight: 1.5 }}>
            Queue is empty. Type a name above, add a picture, and hit Add — or drop
            an image straight onto this panel.
          </p>
        )}

        {done.length > 0 && (
          <>
            <div style={{ ...LABEL, marginTop: 8 }}>ALREADY RUN</div>
            {done.map((q) => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12, color: '#9c94bd', flexShrink: 0 }}>
                <span style={{ textDecoration: 'line-through', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.name}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <button
        className="btn-plain" onClick={() => setShowPresets((v) => !v)}
        style={{ flexShrink: 0, width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 10, border: '2px dashed #ddd6f3', background: '#fff', color: '#5b28d9', fontWeight: 700, fontSize: 12.5 }}
      >
        {showPresets ? 'Hide presets' : '+ Presets'}
      </button>

      {showPresets && presets.length > 0 && (
        <div style={{ flexShrink: 0, marginTop: 8, maxHeight: 132, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 6 }}>
          {presets.slice(0, 24).map((item) => {
            const label = typeof item === 'string' ? item : item.name
            return (
              <button
                key={label} className="btn-plain" disabled={busy}
                onClick={() => add(label, imageForItem(label))}
                style={{ padding: '8px 6px', borderRadius: 9, border: '1px solid #e6e2f5', background: '#fbfaff', fontSize: 11, fontWeight: 700, color: '#2a2a3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}


/**
 * Bots, entirely opt-in.
 *
 * Two separate switches on purpose: adding bots puts them in the room, and the
 * toggle decides whether they actually bid. A host warming up a small room can
 * add four and leave them silent until the real bidding stalls.
 */
function BotControls({ count, on, setOn, busy, onAdd, onClear }) {
  return (
    <section style={{ ...CARD, padding: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={LABEL}>BOTS</span>
        <span style={{ fontSize: 11.5, color: '#9c94bd' }}>
          {count === 0 ? 'none' : `${count} in room`}
        </span>
      </div>

      {count === 0 ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {[2, 4, 6].map((n) => (
            <button
              key={n} className="btn-plain" disabled={busy} onClick={() => onAdd(n)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid #e6e2f5', background: '#fbfaff', fontWeight: 800, fontSize: 12.5, color: '#5b28d9' }}
            >
              + {n}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 9, alignItems: 'center' }}>
          <button
            className="btn-plain" onClick={() => setOn(!on)} disabled={busy}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontWeight: 800, fontSize: 12.5,
              background: on ? '#6b2de6' : '#f3f1fa', color: on ? '#fff' : '#6b6d78',
            }}
          >
            {on ? 'Bots are bidding' : 'Bots are idle'}
          </button>
          <button
            className="btn-plain" onClick={onClear} disabled={busy} title="Remove all bots"
            style={{ padding: '10px 11px', borderRadius: 9, border: '1.5px solid #f2d6d2', background: '#fff', color: '#c0392b', fontWeight: 800, fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      )}

      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9c94bd', lineHeight: 1.45 }}>
        {count === 0
          ? 'Optional. A room plays fine without them.'
          : 'They only bid while this console is open — they are your props, not players.'}
      </p>
    </section>
  )
}

/** The closing board: who won which items. */
function FinalResults({ results, players }) {
  const ranked = [...players].sort((a, b) => (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1))
  const champ = ranked[0]

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
        <div style={LABEL}>AUCTION ENDED</div>
        {champ && champ.wins > 0 ? (
          <>
            <div style={{ marginTop: 12 }}><Avatar seed={champ.avatarSeed || champ.addr} size={64} /></div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: '-.03em', marginTop: 8 }}>
              {champ.name || entityLabel(champ.entityId)}
            </div>
            <div style={{ fontSize: 14.5, color: '#5b28d9', fontWeight: 700 }}>
              top bidder · {champ.wins} lot{champ.wins === 1 ? '' : 's'}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 15, color: '#6b6d78', margin: '12px 0 0' }}>No lots were sold.</p>
        )}
      </div>

      {results.length > 0 && (
        <div style={{ ...CARD, padding: 16, marginTop: 12 }}>
          <div style={LABEL}>WHO WON WHAT</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {results.map((r) => (
              <div key={r.lotId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: '#fbfaff', border: '1px solid #f0edfa' }}>
                {r.image
                  ? <img src={r.image} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  : <Avatar seed={r.name} size={30} />}
                <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 12.5, color: '#6b6d78', whiteSpace: 'nowrap' }}>
                  → <strong style={{ color: '#12121c' }}>{r.winnerName || shortAddress(r.winner)}</strong>
                </span>
                <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 14, color: '#5b28d9' }}>
                  {formatAmount(r.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * Ending the room is rare and destructive, so it lives in a dialog rather than
 * taking permanent space next to the controls a host uses every lot.
 */
/** Ranked by lots won. Pinned beside every phase — never scrolls away. */
function Leaderboard({ players, leadAddr, busy, onKick }) {
  const [confirm, setConfirm] = useState(null)
  const ranked = useMemo(
    () => [...players].sort((a, b) => (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1)),
    [players],
  )

  return (
    <section style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={LABEL}>LEADERBOARD</span>
        <span style={{ fontSize: 12, color: '#9c94bd' }}>{players.length} in room</span>
      </div>

      {ranked.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#9c94bd', lineHeight: 1.5 }}>
          Nobody yet. Put the big screen up — the QR is on it.
        </p>
      ) : (
        <div style={{ marginTop: 8, flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 5, alignContent: 'start' }}>
          {ranked.map((p, i) => {
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
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: '#9c94bd', width: 14 }}>{i + 1}</span>
                <Avatar seed={p.avatarSeed || p.addr} size={22} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || entityLabel(p.entityId)}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b6d78' }}>{formatAmount(p.purse)} left</div>
                </div>
                <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 15, color: p.wins ? '#5b28d9' : '#c9c3dd', minWidth: 16, textAlign: 'right' }}>
                  {p.wins}
                </span>
                {asking ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-plain" disabled={busy}
                      onClick={() => { setConfirm(null); onKick(p.addr, p.name) }}
                      style={{ padding: '4px 7px', borderRadius: 7, background: '#c0392b', color: '#fff', fontWeight: 800, fontSize: 11 }}
                    >
                      Remove
                    </button>
                    <button
                      className="btn-plain" onClick={() => setConfirm(null)}
                      style={{ padding: '4px 6px', borderRadius: 7, background: '#f3f1fa', color: '#6b6d78', fontWeight: 700, fontSize: 11 }}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn-plain" title="Remove from room" onClick={() => setConfirm(p.addr)}
                    style={{ padding: '4px 6px', borderRadius: 7, background: 'transparent', color: '#d5cee6', fontWeight: 800, fontSize: 13, lineHeight: 1 }}
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
 * What the room is looking at, for a host who cannot see the projector.
 *
 * An iframe of the real screen rather than a rebuilt copy: a second
 * implementation of the same view would drift from it the first time either
 * changes, and the whole point is to see EXACTLY what the room sees. It is a
 * deliberate opt-in because it runs the screen's 400ms poll a second time.
 */
function ScreenMirror({ code, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,9,20,.82)', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '.14em' }}>
            WHAT THE ROOM SEES
          </span>
          <button
            className="btn-plain" onClick={onClose}
            style={{ padding: '7px 13px', borderRadius: 9, background: 'rgba(255,255,255,.14)', color: '#fff', fontWeight: 700, fontSize: 13 }}
          >
            Close
          </button>
        </div>
        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#0d0b16' }}>
          <iframe
            src={`/f/${code}/screen`}
            title="Big screen"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      </div>
    </div>
  )
}

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

function Header({ code, state, closed, onEnd, onMirror, onInvite }) {
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
          <span style={{ display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 14.5, color: '#12121c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
            {state?.rname || 'Room'}
          </span>
          {/* Never truncated: this is the number the room is typing in. */}
          <span style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: '#6b2de6', letterSpacing: '.16em', whiteSpace: 'nowrap' }}>
            {code}{closed ? ' · ENDED' : ''}
          </span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0, flexWrap: 'nowrap' }}>
        {onInvite && (
          <button
            className="btn-plain" onClick={onInvite}
            style={{ padding: '7px 11px', borderRadius: 9, background: '#6b2de6', color: '#fff', fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap' }}
          >
            Invite
          </button>
        )}
        {onMirror && (
          <button
            className="btn-plain" onClick={onMirror} title="Watch the big screen"
            style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid #e6e2f5', background: '#fff', color: '#5b28d9', fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap' }}
          >
            Watch
          </button>
        )}
        {/* New tab, not a navigation: a host who taps this mid-lot must not
            lose the console they are running the auction from. */}
        <a
          href={`/f/${code}/history`} target="_blank" rel="noreferrer"
          style={{ fontSize: 12.5, fontWeight: 700, color: '#6b6d78', whiteSpace: 'nowrap' }}
        >
          Log
        </a>
        <a
          href={`/f/${code}/screen`} target="_blank" rel="noreferrer"
          style={{ fontSize: 12.5, fontWeight: 700, color: '#6b6d78', whiteSpace: 'nowrap' }}
        >
          Screen
        </a>
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
/** A lot is live. Rendered only in that state, so it has one job. */
function LiveLot({ state, remaining, urgent, highest, leaderName, busy, run, host }) {
  const pct = state?.duration ? (remaining / state.duration) * 100 : (remaining / 30) * 100
  return (
    <section
      style={{
        ...CARD, flexShrink: 0, overflow: 'hidden',
        border: `2px solid ${urgent ? '#ff4d4d' : '#6b2de6'}`, transition: 'border-color .3s ease',
      }}
    >
      <div style={{ height: 6, background: '#eeecf7' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: urgent ? '#ff4d4d' : '#6b2de6', transition: 'width .2s linear' }} />
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={LABEL}>LOT #{state.lotId} · LIVE</span>
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 28, color: urgent ? '#ff4d4d' : '#12121c', lineHeight: 1 }}>
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
            onClick={() => run(() => host.sellLot(state.lotId), null)}
            style={{
              flex: 2, padding: '16px 0', borderRadius: 13, background: '#5b28d9', color: '#fff',
              fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: '.08em',
              boxShadow: '0 10px 22px rgba(107,45,230,.26)', opacity: busy ? .6 : 1,
            }}
          >
            SELL
          </button>
          <button
            className="btn-plain" disabled={busy}
            onClick={() => run(() => host.closeLot(), 'Cancelled — nobody charged')}
            style={{ flex: 1, padding: '16px 0', borderRadius: 13, border: '2px solid #eeecf7', background: '#fff', color: '#6b6d78', fontWeight: 700, fontSize: 14 }}
          >
            Cancel
          </button>
        </div>
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
                  background: top ? '#efeafd' : '#fbfaff',
                  border: `1px solid ${top ? '#ddd0fa' : '#f0edfa'}`,
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
                <span style={{ marginLeft: 'auto', fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 14, color: top ? '#5b28d9' : '#12121c' }}>
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


/**
 * Starting the next lot.
 *
 * Rebuilt around the one-tap grid rather than the text field: a host mid-event
 * is choosing from things they already set up, not typing. The custom field is
 * still there, below, for when they want something not on the list.
 */


/** The result screen. A session that just stops has no ending; this gives it one. */


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
