'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BidBlitzMark } from '../../components/Logo'
import { JoinCard } from '../../components/JoinCard'
import { CategoryPicker } from '../../components/CategoryPicker'
import { useSession } from '../../lib/useSession'
import { roomCode, roomIdFromCode, sanitizeRoomName } from '../../lib/room.mjs'
import { upsertRoom, accessToken } from '../../lib/supabase'
import { makeHostToken, hashToken, saveHostToken, normalizeCode, isValidCode, freeUrl } from '../../lib/freeRoom.mjs'
import { useAuth } from '../../lib/useAuth'

/** Poll the lobby for the room this wallet just created (we never await receipts). */
async function waitForMyRoom(address, title, tries = 25) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('/api/rooms?limit=12', { cache: 'no-store' })
      const { rooms = [] } = await res.json()
      const mine = rooms.find(
        (r) => r.host?.toLowerCase() === address.toLowerCase() && r.rname === title,
      )
      if (mine) return Number(mine.roomId)
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return 0
}

export default function HostPage() {
  return (
    <Suspense fallback={null}>
      <HostInner />
    </Suspense>
  )
}

function HostInner() {
  const router = useRouter()
  const params = useSearchParams()
  const session = useSession(null)
  const [tab, setTab] = useState(params.get('tab') === 'join' ? 'join' : 'host')

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff,#eceaf6)', fontFamily: "'DM Sans',system-ui,sans-serif", color: '#12121c' }}>
      <header style={{ background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#12121c' }}>
            <BidBlitzMark size={28} />
            <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 22 }}>
              Bid<span style={{ color: '#6b2de6' }}>Blitz</span>
            </span>
          </Link>
          <Link href="/demo" style={{ fontSize: 14, fontWeight: 700, color: '#6b6d78' }}>Try demo</Link>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 460, margin: '0 auto 24px' }}>
          {[['join', 'Join a room'], ['host', 'Host a room']].map(([k, label]) => (
            <button
              key={k}
              className="btn-plain"
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: '13px 0', borderRadius: 12, fontWeight: 700, fontSize: 15,
                border: `2px solid ${tab === k ? '#6b2de6' : '#e6e2f5'}`,
                background: tab === k ? '#efeafd' : '#fff',
                color: tab === k ? '#5b28d9' : '#6b6d78',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'join' ? (
          <JoinTab onGo={(href) => router.push(href)} />
        ) : (
          <CreateTab session={session} router={router} />
        )}
      </main>
    </div>
  )
}

/**
 * One box for both namespaces.
 *
 * Free rooms live at /f/<code> and on-chain rooms at /r/<code>, and the two
 * code formats overlap — "K7QM" is a valid free code AND a valid base36 chain
 * id. So we ask the server rather than guessing: a free room that exists wins,
 * otherwise it is treated as a chain code. Nobody typing a code off a projector
 * should have to know which kind of room they are joining.
 */
function JoinTab({ onGo }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (checking) return
    setError('')

    const free = normalizeCode(code)
    const id = roomIdFromCode(code)
    if (!isValidCode(free) && !id) return setError('That code does not look right')

    setChecking(true)
    try {
      if (isValidCode(free)) {
        const res = await fetch(`/api/free/state?code=${free}`, { cache: 'no-store' })
        if (res.ok) return onGo(freeUrl(free))
      }
      if (id) return onGo(`/r/${roomCode(id)}`)
      setError('No room with that code')
    } catch {
      // The lookup failed, not the code — fall through to the chain namespace
      // rather than stranding someone on a network blip.
      if (id) return onGo(`/r/${roomCode(id)}`)
      setError('Could not reach the server. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ maxWidth: 460, margin: '0 auto', background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 26 }}
    >
      <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78' }}>
        ROOM CODE
      </label>
      <input
        className="field"
        style={{ marginTop: 8, fontFamily: "'DM Mono',monospace", fontSize: 26, letterSpacing: '.28em', textAlign: 'center', textTransform: 'uppercase' }}
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="123456"
        maxLength={6}
        autoComplete="off"
      />
      <button
        className="btn-plain" disabled={checking}
        style={{ width: '100%', marginTop: 16, padding: 20, borderRadius: 14, background: '#6b2de6', color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '.05em', opacity: checking ? .7 : 1 }}
      >
        {checking ? 'Looking…' : 'ENTER THE ROOM →'}
      </button>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: '#6b6d78', textAlign: 'center' }}>Or scan the QR on the big screen.</p>
      {error && <p style={{ margin: '10px 0 0', color: '#c0392b', fontSize: 14, textAlign: 'center' }}>{error}</p>}
    </form>
  )
}

/**
 * Creating a room is one decision, made first: does this room cost anything?
 *
 * FREE rooms are off-chain — no wallet, no MON, no gas, for anyone. MON rooms
 * are on-chain and everyone in them spends their own MON. Everything else
 * (auction vs fantasy, categories, lot length) is a detail underneath that.
 *
 * The old form buried this. It offered "play money" and "real payout" as equal
 * siblings while quietly airdropping MON to make the first one work, so nobody
 * could tell who was paying for what. Now the question is asked out loud.
 */
function CreateTab({ session, router }) {
  const { signer } = session
  const { user, ready: authReady } = useAuth()
  const params = useSearchParams()
  const [chain, setChain] = useState(params.get('chain') === 'mon' ? 'mon' : 'free')
  const [kind, setKind] = useState(params.get('kind') === 'fantasy' ? 'fantasy' : 'auction')
  const [title, setTitle] = useState('')
  const [cats, setCats] = useState(['memes'])
  const [escrow, setEscrow] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const isFantasy = kind === 'fantasy'
  const isFree = chain === 'free'
  const mode = isFantasy ? 1 : 0
  const chosen = isFantasy ? ['fantasy'] : cats

  async function createFree(clean) {
    // The token stays in this browser; only its hash reaches the server, and
    // that hash is what proves ownership of the room afterwards.
    const token = makeHostToken()
    const hostTokenHash = await hashToken(token)

    // Hosting requires an account, so the room is owned by one — that is what
    // puts rooms you RAN into your history, not just ones you played.
    const session = await accessToken()
    const res = await fetch('/api/free/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
      body: JSON.stringify({ title: clean, mode, categories: chosen, hostTokenHash }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `could not create (${res.status})`)

    saveHostToken(data.room.code, token)
    router.push(`/f/${data.room.code}/host`)
  }

  async function createOnChain(clean) {
    await signer.syncNonce?.()
    await signer.createRoom(clean, mode, isFantasy ? false : escrow)
    const mine = await waitForMyRoom(signer.address, clean)
    if (!mine) {
      setError('Room sent — it will appear in the lobby shortly')
      return
    }
    try { localStorage.setItem(`bidblitz:cats:${mine}`, JSON.stringify(chosen)) } catch {}
    // Persist the room's presentation state so every phone that joins sees the
    // same categories/title, not just this host's browser. Best-effort.
    upsertRoom({
      code: roomCode(mine), roomId: mine, mode, title: clean,
      hostName: session.identity?.name, hostAddr: signer.address, categories: chosen,
    }).catch(() => {})
    router.push(`/r/${roomCode(mine)}/host`)
  }

  async function create(e) {
    e.preventDefault()
    if (creating) return
    setError('')
    const clean = sanitizeRoomName(title)
    if (!clean) return setError('Give your auction a name')
    if (!isFantasy && !cats.length) return setError('Pick at least one category')

    setCreating(true)
    try {
      if (isFree) await createFree(clean)
      else await createOnChain(clean)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ background: '#fafafd', border: '1px solid #eeecf7', borderRadius: 20, padding: 24 }}>
      {/* ---- the decision that changes everything else ---- */}
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', marginBottom: 10 }}>
        WHAT KIND OF ROOM
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['free', 'Free · for fun', '#5b28d9', 'No wallet, no MON, no gas — for anyone. Bids are points. Nothing is on-chain.'],
          ['mon', 'MON · on-chain', '#6b2de6', 'Every bid is a Monad transaction. Everyone bids with their own MON and pays their own gas.'],
        ].map(([k, label, color, blurb]) => {
          const active = chain === k
          return (
            <button
              type="button" key={k} className="btn-plain" onClick={() => setChain(k)}
              style={{
                textAlign: 'left', padding: 16, borderRadius: 14,
                border: `2px solid ${active ? color : '#e6e2f5'}`,
                background: active ? `${color}12` : '#fff',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16, color: active ? color : '#12121c' }}>{label}</div>
              <div style={{ fontSize: 12.5, color: '#6b6d78', marginTop: 3, lineHeight: 1.35 }}>{blurb}</div>
            </button>
          )
        })}
      </div>

      {/* ---- auction or fantasy ---- */}
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', margin: '22px 0 10px' }}>
        FORMAT
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['auction', 'Auction', 'Solo bidding on memes, NFTs, anything'],
          ['fantasy', 'Fantasy League', 'Team draft — four squads share a purse'],
        ].map(([k, label, blurb]) => (
          <button
            type="button" key={k} className="btn-plain" onClick={() => setKind(k)}
            style={{
              textAlign: 'left', padding: 16, borderRadius: 14,
              border: `2px solid ${kind === k ? '#6b2de6' : '#e6e2f5'}`,
              background: kind === k ? '#efeafd' : '#fff',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: kind === k ? '#5b28d9' : '#12121c' }}>{label}</div>
            <div style={{ fontSize: 12.5, color: '#6b6d78', marginTop: 3, lineHeight: 1.35 }}>{blurb}</div>
          </button>
        ))}
      </div>

      <label style={{ display: 'block', marginTop: 22, fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78' }}>
        {isFantasy ? 'LEAGUE NAME' : 'AUCTION NAME'}
      </label>
      <input
        className="field"
        style={{ marginTop: 8 }}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isFantasy ? 'Monad Premier League' : 'Monad Blitz Hyderabad'}
        maxLength={40}
      />

      {isFantasy ? (
        <div style={{ marginTop: 22, padding: 18, borderRadius: 14, background: '#f3eeff', border: '1px solid #e2d8fb' }}>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16, color: '#5b28d9' }}>
            🏏 Four teams, one purse each
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#3a3c44' }}>
            Everyone who joins is drafted onto one of four squads. Teammates share
            a purse and draft players together. You add each player live from the
            host console — type a name or use the preset lineup.
          </p>
          <a href="/demo?mode=fantasy" style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, fontSize: 13, color: '#5b28d9' }}>
            See the fantasy demo first →
          </a>
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          <CategoryPicker value={cats} onChange={setCats} />

          {/* Settlement is a MON-room question only. A free room has nothing to
              settle — that is what makes it free. */}
          {!isFree && (
            <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
              {[
                [true, 'Real payout', 'Bids are real MON, escrowed on-chain. On SOLD the winning bid goes to YOUR wallet and outbid bidders are refunded. Both produce a transaction you can show.'],
                [false, 'On-chain play money', 'Bids are just a score and no MON changes hands — but every bid is still a transaction, so bidders pay gas. Worth it for the permanent record and the winner badge; otherwise host a Free room.'],
              ].map(([val, label, blurb]) => (
                <button
                  type="button"
                  key={String(val)}
                  className="btn-plain"
                  onClick={() => setEscrow(val)}
                  style={{
                    textAlign: 'left', padding: 14, borderRadius: 12,
                    border: `2px solid ${escrow === val ? '#6b2de6' : '#e6e2f5'}`,
                    background: escrow === val ? '#efeafd' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                      border: `5px solid ${escrow === val ? '#6b2de6' : '#d7cff0'}`,
                      background: '#fff',
                    }} />
                    <span style={{ fontWeight: 800, fontSize: 15, color: escrow === val ? '#5b28d9' : '#12121c' }}>{label}</span>
                    {val && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#5b28d9', background: '#e5dcfb', padding: '3px 8px', borderRadius: 999 }}>REAL MON</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b6d78', marginTop: 5, lineHeight: 1.4 }}>{blurb}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.45, color: '#6b6d78' }}>
        {isFree
          ? 'This browser becomes the host — keep this tab to run the room. Nobody needs a wallet, and nobody pays anything.'
          : 'Your wallet becomes the host — only it can start and sell lots. You pay gas for each lot you start and sell; bidders pay their own.'}
      </p>

      {!authReady ? null : !user ? (
        /* Hosting requires an account for BOTH room types. A free room is
           otherwise owned by nothing but a token in one browser — clear it and
           the room is unrunnable — and this is what puts a room in the history
           at /account. Joining still needs no account at all. */
        <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: '#fff', border: '1px dashed #cdc2f0', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: '-.02em' }}>
            Sign in to host
          </div>
          <p style={{ margin: '7px auto 0', fontSize: 13.5, color: '#6b6d78', lineHeight: 1.5, maxWidth: '42ch' }}>
            An account keeps your rooms and results, and lets you run a room from
            more than one device. <strong>People joining still need nothing</strong> —
            just a name and a face.
          </p>
          <Link
            href="/account?next=%2Fhost"
            className="btn-plain"
            style={{
              display: 'inline-block', marginTop: 14, padding: '14px 22px', borderRadius: 12,
              background: '#6b2de6', color: '#fff', fontWeight: 800, fontSize: 15,
            }}
          >
            Sign in or create an account →
          </Link>
        </div>
      ) : isFree || signer ? (
        <button
          type="button"
          onClick={create}
          className="btn-plain"
          disabled={creating}
          style={{
            width: '100%', marginTop: 18, padding: 22, borderRadius: 16,
            background: creating ? '#ddd7f5' : isFree ? '#5b28d9' : '#6b2de6',
            color: creating ? '#9c94bd' : '#fff',
            fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: '.05em', textTransform: 'uppercase',
            boxShadow: creating ? 'none' : `0 18px 40px ${isFree ? 'rgba(107,45,230,.28)' : 'rgba(107,45,230,.3)'}`,
          }}
        >
          {creating
            ? 'Creating…'
            : isFree
              ? (isFantasy ? 'Create the free league →' : 'Create the free auction →')
              : (isFantasy ? 'Create the league →' : 'Create the auction →')}
        </button>
      ) : (
        // A MON room needs a wallet, but the setup above stays visible so the
        // form never collapses into a sign-in screen.
        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: '#fff', border: '1px dashed #cdc2f0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5b28d9', marginBottom: 12, textAlign: 'center' }}>
            One step left — connect a wallet to {isFantasy ? 'launch your league' : 'open your auction'}
          </div>
          <JoinCard session={session} roomName={isFantasy ? 'Fantasy League' : 'Your auction'} cta="CONNECT WALLET" />
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#9c94bd', textAlign: 'center', lineHeight: 1.5 }}>
            No wallet? Switch to <strong>Free · for fun</strong> above — it needs nothing at all.
          </p>
        </div>
      )}

      {error && <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 14, textAlign: 'center', wordBreak: 'break-word' }}>{error}</p>}
    </div>
  )
}
