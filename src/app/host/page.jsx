'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BidBlitzMark } from '../../components/Logo'
import { JoinCard } from '../../components/JoinCard'
import { CategoryPicker } from '../../components/CategoryPicker'
import { useSession } from '../../lib/useSession'
import { roomCode, roomIdFromCode, sanitizeRoomName } from '../../lib/room.mjs'
import { modeForCategories } from '../../lib/categories.mjs'
import { upsertRoom } from '../../lib/supabase'

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
          <JoinTab onGo={(code) => router.push(`/r/${code}`)} />
        ) : (
          <CreateTab session={session} router={router} />
        )}
      </main>
    </div>
  )
}

function JoinTab({ onGo }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const id = roomIdFromCode(code)
        if (!id) return setError('That code does not look right')
        onGo(roomCode(id))
      }}
      style={{ maxWidth: 460, margin: '0 auto', background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 26 }}
    >
      <label style={{ display: 'block', fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: '.16em', color: '#6b6d78' }}>
        ROOM CODE
      </label>
      <input
        className="field"
        style={{ marginTop: 8, fontFamily: "'DM Mono',monospace", fontSize: 26, letterSpacing: '.3em', textAlign: 'center', textTransform: 'uppercase' }}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="0001"
        maxLength={6}
        autoComplete="off"
      />
      <button className="btn-plain" style={{ width: '100%', marginTop: 16, padding: 20, borderRadius: 14, background: '#6b2de6', color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '.05em' }}>
        ENTER THE ROOM →
      </button>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: '#6b6d78', textAlign: 'center' }}>Or scan the QR on the big screen.</p>
      {error && <p style={{ margin: '10px 0 0', color: '#c0392b', fontSize: 14, textAlign: 'center' }}>{error}</p>}
    </form>
  )
}

function CreateTab({ session, router }) {
  const { signer } = session
  const params = useSearchParams()
  const [kind, setKind] = useState(params.get('kind') === 'fantasy' ? 'fantasy' : 'auction')
  const [title, setTitle] = useState('')
  const [cats, setCats] = useState(['memes'])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const isFantasy = kind === 'fantasy'

  async function create(e) {
    e.preventDefault()
    if (creating) return
    setError('')
    const clean = sanitizeRoomName(title)
    if (!clean) return setError('Give your auction a name')
    if (!isFantasy && !cats.length) return setError('Pick at least one category')

    // Fantasy is its own mode — a team draft (SQUADS). A normal auction is SOLO.
    const mode = isFantasy ? 1 : 0

    setCreating(true)
    try {
      await signer.syncNonce?.()
      await signer.createRoom(clean, mode)
      const mine = await waitForMyRoom(signer.address, clean)
      if (mine) {
        const chosen = isFantasy ? ['fantasy'] : cats
        try { localStorage.setItem(`bidblitz:cats:${mine}`, JSON.stringify(chosen)) } catch {}
        // Persist the room's presentation state so every phone that joins sees
        // the same categories/title, not just this host's browser. Best-effort:
        // upsertRoom no-ops if Supabase isn't configured.
        upsertRoom({
          code: roomCode(mine), roomId: mine, mode, title: clean,
          hostName: session.identity?.name, hostAddr: signer.address, categories: chosen,
        }).catch(() => {})
        router.push(`/r/${roomCode(mine)}/host`)
      } else {
        setError('Room sent — it will appear in the lobby shortly')
      }
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ background: '#fafafd', border: '1px solid #eeecf7', borderRadius: 20, padding: 24 }}>
      {/* Two distinct kinds of room. Fantasy League is separate — a team draft,
          never mixed with the solo/meme categories. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['auction', 'Auction', 'Solo bidding on memes, NFTs, anything'],
          ['fantasy', 'Fantasy League', 'Team draft — four squads share a purse'],
        ].map(([k, label, blurb]) => (
          <button
            type="button"
            key={k}
            className="btn-plain"
            onClick={() => setKind(k)}
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
        </div>
      )}

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.45, color: '#6b6d78' }}>
        Your wallet becomes the host — only it can start and sell lots. No admin password to lose.
      </p>

      {signer ? (
        <button
          type="button"
          onClick={create}
          className="btn-plain"
          disabled={creating}
          style={{
            width: '100%', marginTop: 18, padding: 22, borderRadius: 16,
            background: creating ? '#ddd7f5' : '#6b2de6', color: creating ? '#9c94bd' : '#fff',
            fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: '.05em', textTransform: 'uppercase',
            boxShadow: creating ? 'none' : '0 18px 40px rgba(107,45,230,.3)',
          }}
        >
          {creating ? 'Creating…' : isFantasy ? 'Create the league →' : 'Create the auction →'}
        </button>
      ) : (
        // No wallet yet: still show the (distinct) setup above, and gate only the
        // final create step behind sign-in — so Auction and Fantasy never collapse
        // to the same screen.
        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: '#fff', border: '1px dashed #cdc2f0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5b28d9', marginBottom: 12, textAlign: 'center' }}>
            One step left — get a wallet to {isFantasy ? 'launch your league' : 'open your auction'}
          </div>
          <JoinCard session={session} roomName={isFantasy ? 'Fantasy League' : 'Your auction'} cta="CONTINUE" />
        </div>
      )}

      {error && <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 14, textAlign: 'center', wordBreak: 'break-word' }}>{error}</p>}
    </div>
  )
}
