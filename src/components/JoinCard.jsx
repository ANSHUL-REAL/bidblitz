'use client'
import { useEffect, useMemo, useState } from 'react'
import { deriveAccount, normalizeName } from '../lib/identity.mjs'
import { squadForAddress } from '../lib/tx.mjs'
import { hasInjectedWallet, walletLabel } from '../lib/wallet.mjs'
import { squadOf } from '../lib/format.mjs'
import { roomCode, roomIdFromCode } from '../lib/room.mjs'
import { Avatar, AVATAR_SEEDS } from './Avatar'
import { upsertParticipant } from '../lib/supabase'

/**
 * Two ways in, deliberately unequal.
 *
 * Name + password is the default and the fast path — no install, no popup, and
 * it regenerates the same wallet on any device. An injected wallet is offered
 * underneath for people who already have one.
 *
 * (Lace cannot appear here: it is a Cardano wallet and does not implement
 * EIP-1193, so it has no way to talk to Monad or any other EVM chain.)
 */
export function JoinCard({ session, roomName, mode, code, cta = 'JOIN THE RACE' }) {
  const fantasy = Number(mode) === 1
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // Start deterministic (SSR and first client render must agree, or React throws
  // a hydration mismatch), then randomise after mount so a room isn't a sea of
  // identical faces. They can still pick.
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0])
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState(null)

  useEffect(() => {
    setAvatarSeed(AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)])
  }, [])

  // Save the chosen name + avatar so the big screen shows them instead of a
  // shortened address. Best-effort: no-op when Supabase isn't configured. The
  // code is canonicalised (uppercased, zero-padded) so the row matches the
  // room and the big screen's lookup — a lowercase/unpadded URL would otherwise
  // write under a mismatched key and be dropped by the foreign key.
  const saveParticipant = (addr) => {
    if (!addr) return
    const rc = code ? roomCode(roomIdFromCode(code)) : code
    upsertParticipant({
      code: rc, addr, name: normalizeName(name) || undefined, avatarSeed,
      squad: fantasy ? squadForAddress(addr) : null,
    }).catch(() => {})
  }

  useEffect(() => {
    setWallet(hasInjectedWallet() ? walletLabel() : null)
  }, [])

  const busy = Boolean(session.status)

  const preview = useMemo(() => {
    try {
      return normalizeName(name) && password ? deriveAccount(name, password).account.address : null
    } catch { return null }
  }, [name, password])

  const squad = fantasy && preview ? squadOf(squadForAddress(preview)) : null

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    try {
      const s = await session.joinWithPassword(name, password)
      saveParticipant(s?.address)
    } catch (err) {
      setError(String(err?.message || err))
    }
  }

  async function connect() {
    if (busy) return
    setError('')
    try {
      const s = await session.connectWallet()
      saveParticipant(s?.address)
    } catch (err) {
      setError(String(err?.message || err))
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: '18px auto 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, letterSpacing: '-.035em',
            textTransform: 'uppercase', fontSize: 'clamp(32px,7vw,48px)', margin: 0, lineHeight: .96,
          }}
        >
          {roomName || 'Get in the race'}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 17, color: '#2a2a3a' }}>
          Two fields. No wallet, no install — you&apos;ll be bidding in about fifteen seconds.
        </p>
      </div>

      <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 24, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>
          YOUR NAME
        </label>
        <input
          className="field" style={{ marginTop: 8 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Rahul"
          autoComplete="off" maxLength={40} required
        />

        <label style={{ display: 'block', marginTop: 16, fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>
          PASSWORD
        </label>
        <input
          className="field" style={{ marginTop: 8 }} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="something only you know"
          autoComplete="new-password" minLength={4} required
        />

        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: '#6b6d78' }}>
          These two generate your wallet, and regenerate it on any device.{' '}
          <strong>Don&apos;t reuse a real password</strong> — this is testnet play money.
        </p>

        <label style={{ display: 'block', marginTop: 16, fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>
          PICK YOUR FACE
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {AVATAR_SEEDS.map((seed) => {
            const active = seed === avatarSeed
            return (
              <button
                key={seed} type="button" title={seed}
                onClick={() => setAvatarSeed(seed)}
                style={{
                  flexShrink: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                  borderRadius: '50%', outline: active ? '3px solid #6b2de6' : '3px solid transparent',
                  outlineOffset: 2, opacity: active ? 1 : 0.6, transition: 'opacity .15s, outline-color .15s',
                }}
              >
                <Avatar seed={seed} size={40} />
              </button>
            )
          })}
        </div>

        {squad && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: `${squad.color}22`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: squad.color }} />
            <span style={{ fontSize: 14 }}>Your wallet drafts you to <strong>{squad.name}</strong></span>
          </div>
        )}

        <button
          className="btn-plain cta-lg"
          disabled={busy}
          style={{
            position: 'relative', overflow: 'hidden', width: '100%', marginTop: 18,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            background: '#6b2de6', color: '#fff', padding: '20px 26px', borderRadius: 14,
            fontWeight: 700, fontSize: 18, letterSpacing: '.05em',
            boxShadow: '0 18px 40px rgba(107,45,230,.3)',
            opacity: busy ? .7 : 1,
          }}
        >
          {busy ? session.status : <>{cta} <span style={{ fontSize: 20 }}>&#8594;</span></>}
        </button>

        {/* --- bring your own wallet --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 14px' }}>
          <span style={{ flex: 1, height: 1, background: '#eeecf7' }} />
          <span style={{ fontSize: 12, color: '#9c94bd', fontWeight: 700, letterSpacing: '.1em' }}>OR</span>
          <span style={{ flex: 1, height: 1, background: '#eeecf7' }} />
        </div>

        <button
          type="button"
          className="btn-plain"
          onClick={connect}
          disabled={busy || !wallet}
          style={{
            width: '100%', padding: '16px 20px', borderRadius: 14,
            border: '2px solid #eeecf7', background: '#fff',
            fontWeight: 700, fontSize: 16, color: wallet ? '#12121c' : '#9c94bd',
          }}
        >
          {wallet ? `Connect ${wallet}` : 'No EVM wallet detected'}
        </button>

        {!wallet && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.45, color: '#9c94bd', textAlign: 'center' }}>
            Works with MetaMask, Rabby, OKX or Backpack. Lace is a Cardano wallet,
            so it can&apos;t connect to Monad.
          </p>
        )}

        {error && (
          <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 14, wordBreak: 'break-word' }}>{error}</p>
        )}
      </form>
    </div>
  )
}
