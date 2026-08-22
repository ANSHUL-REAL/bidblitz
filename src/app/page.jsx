'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readContract } from 'viem/actions'
import { BidBlitzLogo, MonadLockup, MonadMark, Bolt } from '../components/Logo'
import { RaceTrack, racersFromState } from '../components/RaceTrack'
import { useAuction, useCountdown } from '../lib/useAuction'
import { deriveAccount, loadIdentity, saveIdentity, clearIdentity, normalizeName } from '../lib/identity.mjs'
import { Signer, readClient, squadForAddress, requestFunding, waitForArming, CONTRACT } from '../lib/tx.mjs'
import { BIDBLITZ_ABI } from '../lib/abi.mjs'
import { formatCrore, CRORE, QUICK_INCREMENTS, squadOf, entityLabel, shortAddress } from '../lib/format.mjs'

export default function Home() {
  const [identity, setIdentity] = useState(null)
  const [signer, setSigner] = useState(null)
  const [me, setMe] = useState({ entityId: 0, purse: 0n, spent: 0n })
  const [showJoin, setShowJoin] = useState(false)
  const [ready, setReady] = useState(false)
  const { state, setWakeHandler } = useAuction({ intervalMs: 1000 })

  useEffect(() => {
    const saved = loadIdentity()
    if (saved?.key) {
      const s = new Signer(saved.key)
      setIdentity(saved)
      setSigner(s)
      s.syncNonce().catch(() => {})
    }
    setReady(true)
  }, [])

  const refreshMe = useCallback(async () => {
    if (!signer || !CONTRACT) return
    try {
      const [entityId, purse, spent] = await readContract(readClient, {
        address: CONTRACT, abi: BIDBLITZ_ABI, functionName: 'purseOf', args: [signer.address],
      })
      setMe({ entityId: Number(entityId), purse, spent })
    } catch {}
  }, [signer])

  // iOS suspends background tabs; on wake repair both the purse view and the
  // nonce, or every later bid silently fails.
  useEffect(() => {
    setWakeHandler(() => {
      signer?.syncNonce().catch(() => {})
      refreshMe()
    })
  }, [setWakeHandler, signer, refreshMe])

  const lotId = state?.lotId
  useEffect(() => {
    refreshMe()
    signer?.syncNonce().catch(() => {})
  }, [lotId, refreshMe, signer])

  const joined = Boolean(signer)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#fbfbff 0%,#f4f2fb 46%,#efecf8 100%)', overflowX: 'hidden' }}>
      <Header joined={joined} identity={identity} onJoin={() => setShowJoin(true)} onLeave={() => {
        clearIdentity(); setIdentity(null); setSigner(null); setMe({ entityId: 0, purse: 0n, spent: 0n })
      }} />

      <section className="hero-pad" style={{ position: 'relative', maxWidth: 1440, margin: '0 auto' }}>
        <Streaks />
        <div className="hero">
          <HeroCopy
            state={state}
            joined={joined}
            signer={signer}
            me={me}
            refreshMe={refreshMe}
            onJoin={() => setShowJoin(true)}
          />
          <RaceLane state={state} signer={signer} />
        </div>

        <HowItWorks />
        <div style={{ height: 56 }} />
      </section>

      {showJoin && ready && (
        <JoinModal
          onClose={() => setShowJoin(false)}
          onJoined={(ident, s) => {
            setIdentity(ident); setSigner(s); setShowJoin(false); refreshMe()
          }}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- chrome --- */

function Streaks() {
  return (
    <div className="streaks" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className="streak"
          style={{
            top: `${8 + i * 13}%`,
            '--rot': `${-9 + i * 2.4}deg`,
            transform: `rotate(${-9 + i * 2.4}deg)`,
            animationDuration: `${7 + i * 1.3}s`,
            animationDelay: `${-i * 1.1}s`,
          }}
        />
      ))}
    </div>
  )
}

function Header({ joined, identity, onJoin, onLeave }) {
  return (
    <header
      className="header-pad"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
        background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)',
        position: 'sticky', top: 0, zIndex: 30,
      }}
    >
      <BidBlitzLogo size={30} markSize={40} />

      <nav style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="/screen">Big screen</a>
        </div>
        {joined ? (
          <button
            onClick={onLeave}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              background: 'var(--purple-050)', color: 'var(--purple-700)', border: 'none',
              padding: '14px 22px', borderRadius: 12, fontWeight: 700, fontSize: 15,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--monad-purple)', transform: 'rotate(45deg)' }} />
            {identity?.name}
          </button>
        ) : (
          <button className="btn btn-shimmer" style={{ padding: '15px 26px', fontSize: 16 }} onClick={onJoin}>
            Participate in an Auction
            <span style={{ fontSize: 18 }}>→</span>
          </button>
        )}
      </nav>
    </header>
  )
}

/* ------------------------------------------------------------------ hero --- */

function HeroCopy({ state, joined, signer, me, refreshMe, onJoin }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const highest = BigInt(state?.highestBid || 0)
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 26, position: 'relative', zIndex: 1 }}>
      <div className="pill rise">
        <span
          style={{
            width: 9, height: 9, background: 'var(--monad-purple)', borderRadius: 2,
            transform: 'rotate(45deg)', animation: 'bb-bolt 2.4s ease-in-out infinite',
          }}
        />
        <span>{live ? 'BIDDING NOW' : 'LIVE. FAST. FAIR.'}</span>
      </div>

      {live || sold ? (
        <>
          <div style={{ fontSize: 15, letterSpacing: '.2em', color: 'var(--ink-3)', fontWeight: 700 }}>
            LOT #{state.lotId}
          </div>
          <h1
            className="display"
            style={{ margin: 0, fontSize: 'clamp(40px,5.4vw,76px)', textWrap: 'balance' }}
          >
            {state.lname}
          </h1>
          <div>
            <div style={{ fontSize: 14, letterSpacing: '.2em', color: 'var(--ink-3)', fontWeight: 700 }}>
              {sold ? 'SOLD FOR' : 'CURRENT BID'}
            </div>
            <div
              className="display"
              style={{
                fontSize: 'clamp(52px,7vw,92px)', textTransform: 'none', lineHeight: 1,
                color: remaining <= 5 && live ? 'var(--live)' : 'var(--monad-purple)',
              }}
            >
              {formatCrore(highest)}
            </div>
            <div style={{ fontSize: 18, color: 'var(--ink-2)', marginTop: 6 }}>
              {highest === 0n ? 'No bids yet — open it' : `${entityLabel(state.leadEntity)} leading`}
              {live && <> · <strong>{remaining.toFixed(1)}s</strong></>}
            </div>
          </div>
        </>
      ) : (
        <>
          <h1
            className="display rise"
            style={{ margin: 0, fontSize: 'clamp(52px,6.4vw,92px)', textWrap: 'balance' }}
          >
            <span style={{ display: 'block' }}>Who gets</span>
            <span style={{ display: 'block' }}>there <span style={{ color: 'var(--monad-purple)' }}>first?</span></span>
          </h1>
          <p className="rise" style={{ margin: 0, fontSize: 21, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '30ch' }}>
            Lightning-fast auctions on Monad. Real-time bidding. Instant settlement.
            True ownership.
          </p>
        </>
      )}

      {joined ? (
        <BidControls state={state} signer={signer} me={me} refreshMe={refreshMe} live={live} highest={highest} />
      ) : (
        <button
          className="btn btn-shimmer"
          style={{ padding: '22px 34px', fontSize: 19, letterSpacing: '.06em', animation: 'bb-pulse 3.4s ease-out infinite' }}
          onClick={onJoin}
        >
          <span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2, transform: 'rotate(45deg)' }} />
          JOIN THE RACE
          <span style={{ fontSize: 22 }}>→</span>
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 19, color: 'var(--ink-2)' }}>
        <span>Built on</span>
        <MonadLockup height={26} />
      </div>
    </div>
  )
}

function RaceLane({ state, signer }) {
  const [flash, setFlash] = useState(null)
  const prevTop = useRef(null)

  const racers = useMemo(
    () => racersFromState(state, { myAddress: signer?.address }),
    [state, signer],
  )

  // Flash "+BID" on whoever just took the lead.
  useEffect(() => {
    const top = racers[0]?.key
    if (top && prevTop.current && top !== prevTop.current) {
      setFlash(top)
      const id = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(id)
    }
    prevTop.current = top
  }, [racers])

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <RaceTrack racers={racers} flashKey={flash} />
      {!state?.racers?.length && (
        <p style={{ margin: '4px 0 0 26px', fontSize: 14, color: 'var(--ink-3)' }}>
          Team purses. Live bidders appear here the moment a lot opens.
        </p>
      )}
    </div>
  )
}

function BidControls({ state, signer, me, refreshMe, live, highest }) {
  const [pending, setPending] = useState(false)
  const [flash, setFlash] = useState(null)
  const lockedUntil = useRef(0)
  const squad = squadOf(me.entityId)

  const nextBid = (inc) => highest + inc

  async function bid(inc) {
    const now = Date.now()
    if (pending || now < lockedUntil.current || !live) return
    lockedUntil.current = now + 400 // a double-tap must not become two paid transactions

    const amount = nextBid(inc)

    // Stale-bid guard. A reverted transaction still costs full gas on Monad, so
    // a bid we already know is too low would burn real MON for nothing.
    if (amount <= highest) return setFlash({ kind: 'stale', text: `Someone beat you to ${formatCrore(highest)}` })
    if (amount > BigInt(me.purse)) return setFlash({ kind: 'stale', text: 'Not enough purse left' })

    setPending(true); setFlash(null)
    try {
      navigator.vibrate?.(30)
      await signer.placeBid(state.lotId, amount)
      setFlash({ kind: 'sent', text: `${formatCrore(amount)} sent` })
    } catch (err) {
      await signer.syncNonce().catch(() => {})
      setFlash({ kind: 'error', text: String(err?.message || err).slice(0, 80) })
    } finally {
      setPending(false)
      setTimeout(refreshMe, 800)
    }
  }

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(id)
  }, [flash])

  return (
    <div style={{ width: '100%', maxWidth: 520 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 12, marginBottom: 12,
          background: squad ? `${squad.color}1f` : 'var(--purple-050)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: squad?.color || 'var(--monad-purple)' }} />
          {entityLabel(me.entityId)}
        </span>
        <span className="display" style={{ fontSize: 22, textTransform: 'none' }}>{formatCrore(me.purse)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {QUICK_INCREMENTS.map((inc) => (
          <button
            key={inc.toString()}
            className="btn"
            onClick={() => bid(inc)}
            disabled={!live || pending}
            style={{ flexDirection: 'column', gap: 0, padding: '16px 4px', borderRadius: 12 }}
          >
            <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>+{Number(inc / CRORE)} Cr</span>
            <span className="display" style={{ fontSize: 18, textTransform: 'none' }}>{formatCrore(nextBid(inc))}</span>
          </button>
        ))}
      </div>

      {flash && (
        <div
          style={{
            marginTop: 10, padding: '9px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: flash.kind === 'error' ? '#fdecea' : flash.kind === 'stale' ? '#fff6e5' : '#e9f9ef',
            color: flash.kind === 'error' ? '#c0392b' : flash.kind === 'stale' ? '#8a5a00' : '#12703a',
          }}
        >
          {flash.text}
        </div>
      )}
      {!live && (
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-3)' }}>
          Waiting for the next lot to open…
        </p>
      )}
    </div>
  )
}

function HowItWorks() {
  const steps = [
    ['01', 'JOIN', 'Name and a password. No wallet, no install, no seed phrase.'],
    ['02', 'BID', 'Every tap is a real transaction, confirmed in under a second.'],
    ['03', 'WIN', 'Highest bid when the timer ends takes the lot — provably, on-chain.'],
  ]
  return (
    <div id="how" className="steps card" style={{ marginTop: 66, position: 'relative', zIndex: 1 }}>
      {steps.map(([n, title, body], i) => (
        <div className="step" key={n}>
          <div className="step-num" style={i === 1 ? { animation: 'bb-bolt 2.8s ease-in-out infinite' } : undefined}>
            {n}
          </div>
          <div>
            <div className="display" style={{ fontSize: 21, color: 'var(--monad-purple)', letterSpacing: '.02em' }}>
              {title}
            </div>
            <div style={{ marginTop: 8, fontSize: 17, lineHeight: 1.45, color: 'var(--ink-2)' }}>{body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ join --- */

function JoinModal({ onClose, onJoined }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const busy = Boolean(status)

  const preview = useMemo(() => {
    try {
      return normalizeName(name) && password ? deriveAccount(name, password).account.address : null
    } catch { return null }
  }, [name, password])

  const squad = preview ? squadOf(squadForAddress(preview)) : null

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    try {
      setStatus('Deriving your wallet…')
      const { key, account } = deriveAccount(name, password)
      const s = new Signer(key)

      // Already registered? Knowing the password IS the proof of identity, so
      // this is them returning — skip funding entirely.
      const [existing] = await readContract(readClient, {
        address: CONTRACT, abi: BIDBLITZ_ABI, functionName: 'purseOf', args: [account.address],
      })

      if (Number(existing) !== 0) {
        const ident = { name, key, address: account.address }
        saveIdentity(ident)
        return onJoined(ident, s)
      }

      setStatus('Funding your wallet…')
      const fund = await requestFunding(account.address)

      const deadline = Date.now() + 20000
      let funded = false
      while (Date.now() < deadline) {
        if ((await s.balance()) > 0n) { funded = true; break }
        await new Promise((r) => setTimeout(r, 400))
      }
      if (!funded) {
        await requestFunding(account.address, true)
        await new Promise((r) => setTimeout(r, 2500))
      }

      // Monad derives the inflight gas budget from state 3 blocks back, so a
      // freshly funded wallet's first bid would be excluded at consensus —
      // silently, with no receipt and no revert.
      setStatus('Arming your wallet…')
      await waitForArming(await readClient.getBlockNumber(), fund?.armBlocks ?? 4)

      setStatus('Joining the auction…')
      await s.syncNonce()
      const sq = squadForAddress(account.address)
      await s.joinSquad(sq)

      const ident = { name, key, address: account.address, squad: sq }
      saveIdentity(ident)
      onJoined(ident, s)
    } catch (err) {
      setError(String(err?.message || err))
      setStatus('')
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center',
        background: 'rgba(14,9,28,.55)', backdropFilter: 'blur(6px)', padding: 20,
      }}
    >
      <form className="card rise" style={{ padding: 28, width: '100%', maxWidth: 440 }} onSubmit={submit}>
        <BidBlitzLogo size={22} markSize={30} />
        <h2 className="display" style={{ fontSize: 34, margin: '16px 0 6px' }}>Join the race</h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-3)' }}>
          Your name and password generate a wallet on this device. Nothing to install.
        </p>

        <input
          className="field" style={{ marginTop: 18 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Your name"
          autoComplete="off" maxLength={40} required autoFocus
        />
        <input
          className="field" style={{ marginTop: 10 }} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Password"
          autoComplete="new-password" minLength={4} required
        />
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)' }}>
          Same name + password gets you back in on any phone. <strong>Don't reuse a real
          password</strong> — this is testnet play money.
        </p>

        {squad && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: `${squad.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: squad.color }} />
            <span style={{ fontSize: 14 }}>Your wallet drafts you to <strong>{squad.name}</strong></span>
          </div>
        )}

        <button className="btn btn-shimmer" style={{ width: '100%', marginTop: 18 }} disabled={busy}>
          {busy ? status : <>JOIN THE RACE <span style={{ fontSize: 20 }}>→</span></>}
        </button>

        {error && <p style={{ margin: '12px 0 0', color: '#c0392b', fontSize: 14, wordBreak: 'break-word' }}>{error}</p>}
        {preview && !busy && (
          <p className="mono" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{shortAddress(preview)}</p>
        )}
      </form>
    </div>
  )
}
