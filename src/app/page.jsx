'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readContract } from 'viem/actions'
import { BidBlitzLogo, MonadLockup, MonadMark, Bolt } from '../components/Logo'
import { useAuction, useCountdown } from '../lib/useAuction'
import { deriveAccount, loadIdentity, saveIdentity, clearIdentity, normalizeName } from '../lib/identity.mjs'
import { Signer, readClient, squadForAddress, requestFunding, waitForArming, CONTRACT } from '../lib/tx.mjs'
import { BIDBLITZ_ABI } from '../lib/abi.mjs'
import { formatCrore, CRORE, QUICK_INCREMENTS, SQUADS, squadOf, entityLabel, shortAddress } from '../lib/format.mjs'

const STAGE = { JOIN: 'join', ARMING: 'arming', BIDDING: 'bidding' }

export default function Home() {
  const [stage, setStage] = useState(null) // null = still reading localStorage
  const [identity, setIdentity] = useState(null)
  const [signer, setSigner] = useState(null)
  const [me, setMe] = useState({ entityId: 0, purse: 0n, spent: 0n })
  const [status, setStatus] = useState('')
  const { state, setWakeHandler } = useAuction({ intervalMs: 1000 })

  // Resume a returning phone straight into bidding.
  useEffect(() => {
    const saved = loadIdentity()
    if (saved?.key) {
      const s = new Signer(saved.key)
      setIdentity(saved)
      setSigner(s)
      setStage(STAGE.BIDDING)
      s.syncNonce().catch(() => {})
    } else {
      setStage(STAGE.JOIN)
    }
  }, [])

  const refreshMe = useCallback(async () => {
    if (!signer || !CONTRACT) return
    try {
      const [entityId, purse, spent] = await readContract(readClient, {
        address: CONTRACT,
        abi: BIDBLITZ_ABI,
        functionName: 'purseOf',
        args: [signer.address],
      })
      setMe({ entityId: Number(entityId), purse, spent })
    } catch {}
  }, [signer])

  // iOS suspends background tabs. On wake, repair both the purse view and the
  // nonce — a stale nonce means every subsequent bid silently fails.
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

  if (stage === null) return <Splash />

  if (stage !== STAGE.BIDDING) {
    return (
      <JoinView
        stage={stage}
        status={status}
        onJoin={async (name, password) => {
          setStatus('Deriving your wallet…')
          const { key, account } = deriveAccount(name, password)
          const s = new Signer(key)

          try {
            // Already registered? Then this IS them returning (knowing the
            // password is the proof), so skip funding entirely.
            const [existing] = await readContract(readClient, {
              address: CONTRACT,
              abi: BIDBLITZ_ABI,
              functionName: 'purseOf',
              args: [account.address],
            })

            if (Number(existing) !== 0) {
              const ident = { name, key, address: account.address }
              saveIdentity(ident)
              setIdentity(ident)
              setSigner(s)
              setStage(STAGE.BIDDING)
              return
            }

            setStage(STAGE.ARMING)
            setStatus('Funding your wallet…')
            const fund = await requestFunding(account.address)

            // Poll our own balance rather than waiting on a receipt.
            const deadline = Date.now() + 20000
            let funded = false
            while (Date.now() < deadline) {
              if ((await s.balance()) > 0n) { funded = true; break }
              await new Promise((r) => setTimeout(r, 400))
            }
            if (!funded) {
              await requestFunding(account.address, true) // force: break a stale lock
              await new Promise((r) => setTimeout(r, 2500))
            }

            // Monad computes an account's inflight gas budget from state 3
            // blocks back. Bidding immediately means the first bid is excluded
            // at consensus — silently, no receipt, no revert.
            setStatus('Arming your wallet…')
            const block = await readClient.getBlockNumber()
            await waitForArming(block, fund?.armBlocks ?? 4)

            setStatus('Joining the auction…')
            await s.syncNonce()
            const squad = squadForAddress(account.address)
            await s.joinSquad(squad)

            const ident = { name, key, address: account.address, squad }
            saveIdentity(ident)
            setIdentity(ident)
            setSigner(s)
            setStage(STAGE.BIDDING)
          } catch (err) {
            setStatus('')
            setStage(STAGE.JOIN)
            throw err
          }
        }}
      />
    )
  }

  return (
    <BidView
      state={state}
      signer={signer}
      identity={identity}
      me={me}
      refreshMe={refreshMe}
      onLeave={() => {
        clearIdentity()
        setIdentity(null)
        setSigner(null)
        setStage(STAGE.JOIN)
      }}
    />
  )
}

function Splash() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <MonadMark size={56} style={{ color: 'var(--monad-purple)', opacity: 0.5 }} />
    </main>
  )
}

/* ------------------------------------------------------------------ join --- */

function JoinView({ onJoin, stage, status }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => {
    try {
      return normalizeName(name) && password ? deriveAccount(name, password).account.address : null
    } catch {
      return null
    }
  }, [name, password])

  const squad = preview ? squadOf(squadForAddress(preview)) : null
  const working = busy || stage === 'arming'

  async function submit(e) {
    e.preventDefault()
    if (working) return
    setError('')
    setBusy(true)
    try {
      await onJoin(name, password)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#fbfbff 0%,#f1f0f9 46%,#eceaf6 100%)',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', background: '#fff',
          boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 30,
        }}
      >
        <BidBlitzLogo size={24} markSize={32} />
        <span className="pill" style={{ fontSize: 11, padding: '7px 12px', gap: 7 }}>
          <Bolt size={9} color="var(--monad-purple)" />
          LIVE
        </span>
      </header>

      <section style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 48px' }}>
        <h1
          className="display rise"
          style={{ margin: 0, fontSize: 'clamp(40px,11vw,62px)', textWrap: 'balance' }}
        >
          Who gets<br />there <span style={{ color: 'var(--monad-purple)' }}>first?</span>
        </h1>
        <p
          className="rise"
          style={{ margin: '16px 0 0', fontSize: 18, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '32ch' }}
        >
          Every bid is a real Monad transaction. No wallet, no install — just a name
          and a password.
        </p>

        <form onSubmit={submit} className="card rise" style={{ marginTop: 26, padding: 22 }}>
          <label style={{ display: 'block', fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: 'var(--ink-3)' }}>
            YOUR NAME
          </label>
          <input
            className="field"
            style={{ marginTop: 8 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rahul"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
            required
          />

          <label style={{ display: 'block', marginTop: 18, fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: 'var(--ink-3)' }}>
            PASSWORD
          </label>
          <input
            className="field"
            style={{ marginTop: 8 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="something only you know"
            autoComplete="new-password"
            minLength={4}
            required
          />
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)' }}>
            These two generate your wallet. Same name + password on any phone gets you
            back in. <strong>Don't reuse a real password</strong> — this is testnet play money.
          </p>

          {squad && (
            <div
              style={{
                marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                background: `${squad.color}18`, display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: squad.color }} />
              <span style={{ fontSize: 14 }}>
                Your wallet drafts you to <strong>{squad.name}</strong>
              </span>
            </div>
          )}

          <button className="btn btn-shimmer" style={{ width: '100%', marginTop: 20 }} disabled={working}>
            {working ? status || 'Working…' : 'JOIN THE AUCTION'}
            {!working && <span style={{ fontSize: 20 }}>→</span>}
          </button>

          {error && (
            <p style={{ margin: '12px 0 0', color: '#c0392b', fontSize: 14, wordBreak: 'break-word' }}>{error}</p>
          )}

          {preview && (
            <p className="mono" style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              {shortAddress(preview)}
            </p>
          )}
        </form>

        <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
          <span style={{ fontSize: 15 }}>Built on</span>
          <MonadLockup height={22} />
        </div>
      </section>
    </main>
  )
}

/* ------------------------------------------------------------------- bid --- */

function BidView({ state, signer, identity, me, refreshMe, onLeave }) {
  const [pending, setPending] = useState(false)
  const [flash, setFlash] = useState(null)
  const lockedUntil = useRef(0)

  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const highest = BigInt(state?.highestBid || 0)
  const iAmLeading = state?.bidder?.toLowerCase() === signer?.address?.toLowerCase()
  const squad = squadOf(me.entityId)
  const live = open && remaining > 0

  const nextBid = (increment) => (highest > 0n ? highest : 0n) + increment

  async function bid(increment) {
    const now = Date.now()
    if (pending || now < lockedUntil.current || !live) return
    lockedUntil.current = now + 400 // stops double-taps becoming two paid transactions

    const amount = nextBid(increment)

    // Stale-bid guard. On Monad a REVERTED transaction still costs full gas, so
    // submitting a bid we already know is too low burns real MON for nothing.
    // Catching it here is both cheaper and better UX than a revert.
    if (amount <= highest) {
      setFlash({ kind: 'stale', text: `Someone beat you to ${formatCrore(highest)}` })
      return
    }
    if (amount > BigInt(me.purse)) {
      setFlash({ kind: 'stale', text: 'Not enough purse left' })
      return
    }

    setPending(true)
    setFlash(null)
    try {
      navigator.vibrate?.(30)
      await signer.placeBid(state.lotId, amount)
      setFlash({ kind: 'sent', text: `${formatCrore(amount)} sent` })
    } catch (err) {
      await signer.syncNonce().catch(() => {})
      setFlash({ kind: 'error', text: String(err?.message || err).slice(0, 90) })
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

  // Keep the screen awake — people hold the phone for a whole auction.
  useEffect(() => {
    let lock
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => lock?.release?.().catch(() => {})
  }, [])

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-2)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)',
        }}
      >
        <BidBlitzLogo size={19} markSize={26} />
        <button
          onClick={onLeave}
          style={{
            border: 'none', background: 'transparent', color: 'var(--ink-3)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {identity?.name}
        </button>
      </header>

      {/* purse */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: squad ? `${squad.color}14` : '#fff',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: squad?.color || 'var(--monad-purple)' }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{entityLabel(me.entityId)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-3)', fontWeight: 700 }}>PURSE</div>
          <div className="display" style={{ fontSize: 20, textTransform: 'none' }}>{formatCrore(me.purse)}</div>
        </div>
      </div>

      {/* the lot */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 18px', textAlign: 'center' }}>
        {!open && !state?.lotId && <Waiting />}

        {state?.lotId > 0 && (
          <>
            {state.limage && (
              <img
                src={state.limage}
                alt=""
                style={{
                  width: 132, height: 132, objectFit: 'cover', borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)', marginBottom: 16,
                }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <h2 className="display" style={{ margin: 0, fontSize: 'clamp(26px,7vw,38px)', textWrap: 'balance' }}>
              {state.lname || `Lot #${state.lotId}`}
            </h2>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--ink-3)', fontWeight: 700 }}>
                {state.sold ? 'SOLD FOR' : 'CURRENT BID'}
              </div>
              <div
                className="display"
                style={{
                  fontSize: 'clamp(46px,15vw,72px)',
                  color: iAmLeading ? 'var(--win)' : 'var(--monad-purple)',
                  textTransform: 'none',
                  transition: 'color .3s ease',
                }}
              >
                {formatCrore(highest)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', minHeight: 20 }}>
                {highest === 0n
                  ? 'No bids yet — open it'
                  : iAmLeading
                    ? "You're winning"
                    : `${entityLabel(state.leadEntity)} leading`}
              </div>
            </div>

            {live && <Timer remaining={remaining} />}
            {state.sold && <SoldStamp winner={iAmLeading} />}
          </>
        )}
      </div>

      {/* controls */}
      <div style={{ padding: '14px 16px calc(16px + env(safe-area-inset-bottom))', background: '#fff', boxShadow: '0 -2px 20px rgba(30,20,70,.07)' }}>
        {flash && (
          <div
            style={{
              marginBottom: 10, padding: '9px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
              background: flash.kind === 'error' ? '#fdecea' : flash.kind === 'stale' ? '#fff6e5' : '#e9f9ef',
              color: flash.kind === 'error' ? '#c0392b' : flash.kind === 'stale' ? '#8a5a00' : '#12703a',
            }}
          >
            {flash.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_INCREMENTS.map((inc) => (
            <button
              key={inc.toString()}
              className="btn"
              onClick={() => bid(inc)}
              disabled={!live || pending}
              style={{ padding: '16px 6px', fontSize: 15, borderRadius: 'var(--radius-sm)', gap: 0, flexDirection: 'column' }}
            >
              <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>+{Number(inc / CRORE)} Cr</span>
              <span className="display" style={{ fontSize: 17, textTransform: 'none' }}>
                {formatCrore(nextBid(inc))}
              </span>
            </button>
          ))}
        </div>

        {!live && (
          <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
            {state?.sold ? 'Lot closed — next one coming up' : 'Waiting for the next lot…'}
          </p>
        )}
      </div>
    </main>
  )
}

function Timer({ remaining }) {
  const urgent = remaining <= 5
  return (
    <div style={{ marginTop: 20, width: '100%', maxWidth: 300 }}>
      <div
        className="display"
        style={{ fontSize: 30, color: urgent ? 'var(--live)' : 'var(--ink)', textTransform: 'none' }}
      >
        {remaining.toFixed(1)}s
      </div>
      <div style={{ height: 6, background: 'var(--line)', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, (remaining / 20) * 100)}%`,
            background: urgent ? 'var(--live)' : 'var(--monad-purple)',
            transition: 'width .1s linear, background .3s ease',
          }}
        />
      </div>
    </div>
  )
}

function SoldStamp({ winner }) {
  return (
    <div
      className="display"
      style={{
        marginTop: 18, padding: '10px 22px', borderRadius: 'var(--radius)',
        background: winner ? 'var(--win)' : 'var(--ink)', color: '#fff', fontSize: 26,
        animation: 'bb-slam .5s cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      {winner ? 'YOU WON IT' : 'SOLD'}
    </div>
  )
}

function Waiting() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
      <MonadMark size={44} style={{ opacity: 0.35 }} />
      <p style={{ marginTop: 14, fontSize: 16 }}>You're in. Waiting for the first lot…</p>
    </div>
  )
}
