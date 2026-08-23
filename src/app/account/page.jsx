'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../components/Logo'
import { useAuth } from '../../lib/useAuth'
import { authSignUp, authSignIn, authSignOut, listRooms, participantCounts, hasSupabase, accessToken } from '../../lib/supabase'
import { formatAmount } from '../../lib/format.mjs'

/**
 * An account does two separate jobs, and it is worth keeping them apart.
 *
 * For a HOST it is the dashboard of rooms they have run. For a PLAYER it is the
 * only reason to sign in at all: a free room remembers you by an id in
 * localStorage, so clearing the browser or switching phones loses every win.
 * Logging in attaches those rooms to the account instead.
 *
 * Neither is required to play. Joining is still a name and a face.
 */
export default function Account() {
  const { user, ready } = useAuth()

  if (!hasSupabase) {
    return <Shell><p style={p}>Accounts need Supabase configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).</p></Shell>
  }
  if (!ready) return <Shell><p style={p}>Loading…</p></Shell>
  if (!user) return <Shell><AuthForms /></Shell>
  return <Shell><Dashboard user={user} /></Shell>
}

const p = { color: '#6b6d78', fontSize: 15 }

function Shell({ children }) {
  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff,#eceaf6)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BidBlitzMark size={26} />
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 18 }}>Host account</span>
        </Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: '#6b6d78' }}>Home</Link>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '22px 16px 60px' }}>{children}</div>
    </main>
  )
}

function AuthForms() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      if (mode === 'signup') {
        const { error, needsConfirm } = await authSignUp(email, password)
        if (error) setErr(error)
        else if (needsConfirm) setMsg('Account created. Check your email to confirm, then sign in. (Tip: disable "Confirm email" in Supabase Auth settings for instant demo login.)')
        else setMsg('Account created — you are signed in.')
      } else {
        const { error } = await authSignIn(email, password)
        if (error) setErr(error)
      }
    } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 420, margin: '10px auto', background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 24, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['signin', 'Sign in'], ['signup', 'Register']].map(([k, l]) => (
          <button key={k} type="button" className="btn-plain" onClick={() => { setMode(k); setErr(''); setMsg('') }}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontWeight: 800, fontSize: 14,
              border: `2px solid ${mode === k ? '#6b2de6' : '#e6e2f5'}`, background: mode === k ? '#efeafd' : '#fff', color: mode === k ? '#5b28d9' : '#6b6d78' }}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        <input className="field" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className="field" style={{ marginTop: 10 }} type="password" required minLength={6} placeholder="password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        <button type="submit" disabled={busy} className="btn-plain"
          style={{ width: '100%', marginTop: 16, padding: 16, borderRadius: 12, background: busy ? '#ddd7f5' : '#6b2de6', color: '#fff', fontWeight: 800, fontSize: 16 }}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {msg && <p style={{ marginTop: 12, fontSize: 13.5, color: '#12703a', lineHeight: 1.5 }}>{msg}</p>}
      {err && <p style={{ marginTop: 12, fontSize: 13.5, color: '#c0392b' }}>{err}</p>}
      <p style={{ marginTop: 14, fontSize: 12.5, color: '#9c94bd', lineHeight: 1.5 }}>
        Only the host signs in. People who join your events never need an account — they scan the QR and bid.
      </p>
    </div>
  )
}

/** Free rooms this account has played, newest first. */
function FreeHistory() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const token = await accessToken()
        if (!token) return
        const res = await fetch('/api/free/history', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) setError(body.error || 'Could not load your history.')
        else setData(body)
      } catch (e) {
        if (alive) setError(String(e?.message || e))
      }
    })()
    return () => { alive = false }
  }, [])

  if (error) return <p style={{ ...p, color: '#c0392b' }}>{error}</p>
  if (!data) return null

  const { history, totals } = data

  if (!history.length) {
    return (
      <div style={{ padding: 16, borderRadius: 14, background: '#fbfaff', border: '1px dashed #ddd6f3', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>No rooms yet</div>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6b6d78', lineHeight: 1.5 }}>
          Free rooms you join while signed in show up here — with what you won and
          what you spent. <Link href="/host?chain=free" style={{ color: '#5b28d9', fontWeight: 700 }}>Host one →</Link>
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20 }}>Your history</span>
        <span style={{ fontSize: 13.5, color: '#6b6d78' }}>
          {totals.rooms} room{totals.rooms === 1 ? '' : 's'} · <strong style={{ color: '#12703a' }}>{totals.wins} won</strong> · {formatAmount(totals.spent)} PTS spent
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {history.map((h) => (
          <div key={h.code + h.playedAt} style={{ padding: '13px 15px', background: '#fff', borderRadius: 13, border: '1px solid #eeecf7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12.5, fontWeight: 700, color: '#6b2de6', letterSpacing: '.1em' }}>{h.code}</span>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{h.title}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#12703a', background: '#e9f9ef', padding: '2px 7px', borderRadius: 999 }}>FREE</span>
              {!h.closed && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#5b28d9', background: '#efeafd', padding: '2px 7px', borderRadius: 999 }}>LIVE</span>}
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#9c94bd' }}>
                {new Date(h.playedAt).toLocaleDateString()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13, color: '#6b6d78', flexWrap: 'wrap' }}>
              <span><strong style={{ color: h.wins ? '#12703a' : '#12121c' }}>{h.wins}</strong> won</span>
              <span><strong style={{ color: '#12121c' }}>{formatAmount(h.spent)}</strong> spent</span>
              <span>{h.players} player{h.players === 1 ? '' : 's'} · {h.lots} lot{h.lots === 1 ? '' : 's'}</span>
              {!h.closed && (
                <Link href={`/f/${h.code}`} style={{ marginLeft: 'auto', color: '#5b28d9', fontWeight: 700 }}>Rejoin →</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Dashboard({ user }) {
  const [rooms, setRooms] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listRooms().then(async (rs) => {
      if (!alive) return
      setRooms(rs); setLoading(false)
      const c = await participantCounts(rs.map((r) => r.code))
      if (alive) setCounts(c)
    })
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 26 }}>Your events</div>
          <div style={{ fontSize: 13, color: '#6b6d78' }}>{user.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/host" className="btn-plain" style={{ padding: '11px 16px', borderRadius: 10, background: '#6b2de6', color: '#fff', fontWeight: 800, fontSize: 14 }}>Host a new event →</Link>
          <button type="button" onClick={() => authSignOut()} className="btn-plain" style={{ padding: '11px 16px', borderRadius: 10, border: '2px solid #e6e2f5', background: '#fff', fontWeight: 700, fontSize: 14, color: '#6b6d78' }}>Sign out</button>
        </div>
      </div>

      <FreeHistory />

      <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 20, margin: '26px 0 12px' }}>
        Rooms you hosted
      </div>

      {loading ? <p style={p}>Loading rooms…</p> : rooms.length === 0 ? <p style={p}>No events yet.</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rooms.map((r) => (
            <div key={r.code} style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1px solid #eeecf7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: '#6b2de6', letterSpacing: '.1em' }}>{r.code}</span>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{r.title || 'Untitled'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b6d78', background: '#f1eefb', padding: '3px 8px', borderRadius: 999 }}>
                  {Number(r.mode) === 1 ? 'Fantasy' : 'Auction'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b6d78' }}>{counts[r.code] || 0} joined</span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                {['history', 'leaderboard', 'screen', 'host'].map((v) => (
                  <Link key={v} href={`/r/${r.code}/${v === 'host' ? 'host' : v}`} style={{ fontSize: 13, fontWeight: 700, color: '#5b28d9', textTransform: 'capitalize' }}>{v}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
