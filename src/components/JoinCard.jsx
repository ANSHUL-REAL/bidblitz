'use client'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { normalizeName } from '../lib/identity.mjs'
import { squadForAddress } from '../lib/tx.mjs'
import { hasInjectedWallet, walletLabel } from '../lib/wallet.mjs'
import { squadOf } from '../lib/format.mjs'
import { roomCode, roomIdFromCode } from '../lib/room.mjs'
import { Avatar, AVATAR_SEEDS } from './Avatar'
import { upsertParticipant } from '../lib/supabase'

const FAUCET = 'https://faucet.monad.xyz'

/**
 * One way into an on-chain room: your own wallet, your own MON.
 *
 * There used to be a name+password burner here that the platform airdropped MON
 * into. It is gone in both directions — BidBlitz no longer pays for anyone's
 * gas, and a wallet derived from a guessable password is no place for real MON.
 * The name and avatar below are now purely cosmetic (they label you on the big
 * screen); the wallet is the identity.
 *
 * If you want the no-wallet, fifteen-second join, host a FREE room instead —
 * those are off-chain and cost nobody anything.
 *
 * (Lace cannot appear here: it is a Cardano wallet and does not implement
 * EIP-1193, so it has no way to talk to Monad or any other EVM chain.)
 */
export function JoinCard({ session, roomName, mode, escrow, code, cta = 'CONNECT WALLET & JOIN' }) {
  const fantasy = Number(mode) === 1
  const [name, setName] = useState('')
  // Start deterministic (SSR and first client render must agree, or React throws
  // a hydration mismatch), then randomise after mount so a room isn't a sea of
  // identical faces. They can still pick.
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0])
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState(null)

  useEffect(() => {
    setAvatarSeed(AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)])
    setWallet(hasInjectedWallet() ? walletLabel() : null)
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

  const busy = Boolean(session.status)
  const funding = session.funding

  async function connect(e) {
    e?.preventDefault()
    if (busy) return
    setError('')
    try {
      const s = await session.connectWallet()
      saveParticipant(s?.address)
    } catch (err) {
      setError(String(err?.message || err))
    }
  }

  const squad = fantasy && session.signer?.address ? squadOf(squadForAddress(session.signer.address)) : null

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
          {escrow
            ? 'Real-MON room — your bids are escrowed on-chain and the winner pays the host.'
            : 'Play-money bids, settled on-chain. You only ever pay your own gas.'}
        </p>
      </div>

      <form onSubmit={connect} style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 24, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>
          DISPLAY NAME <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>(optional)</span>
        </label>
        <input
          className="field" style={{ marginTop: 8 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Rahul"
          autoComplete="off" maxLength={40}
        />
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: '#6b6d78' }}>
          Just how you appear on the big screen. Your <strong>wallet</strong> is your identity —
          BidBlitz never asks for a password and never holds your keys.
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

        {funding ? (
          <FundingPanel funding={funding} />
        ) : (
          <button
            className="btn-plain cta-lg"
            disabled={busy || !wallet}
            style={{
              position: 'relative', overflow: 'hidden', width: '100%', marginTop: 18,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 14,
              background: wallet ? '#6b2de6' : '#eeecf7', color: wallet ? '#fff' : '#9c94bd',
              padding: '20px 26px', borderRadius: 14,
              fontWeight: 700, fontSize: 18, letterSpacing: '.05em',
              boxShadow: wallet ? '0 18px 40px rgba(107,45,230,.3)' : 'none',
              opacity: busy ? .7 : 1,
            }}
          >
            {busy ? session.status : wallet ? <>{cta} <span style={{ fontSize: 20 }}>&#8594;</span></> : 'NO EVM WALLET DETECTED'}
          </button>
        )}

        {!wallet && !funding && (
          <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#9c94bd', textAlign: 'center' }}>
            Install MetaMask, Rabby, OKX or Backpack to bid here. Lace is a Cardano
            wallet, so it can&apos;t connect to Monad.
          </p>
        )}

        <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#9c94bd', textAlign: 'center' }}>
          No wallet and just here for fun? <strong>Free rooms</strong> need neither a wallet nor MON.
        </p>

        {error && (
          <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 14, wordBreak: 'break-word' }}>{error}</p>
        )}
      </form>
    </div>
  )
}

/**
 * Shown when the connected wallet can't cover its own gas. We can't fund it —
 * that is the whole point — so the job here is to make self-funding one tap:
 * the address to send to, how short it is, and a link to the faucet.
 */
function FundingPanel({ funding }) {
  const [copied, setCopied] = useState(false)
  const short = (n) => Number(formatEther(n)).toFixed(3)
  const missing = funding.need > funding.balance ? funding.need - funding.balance : 0n

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(funding.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div style={{ marginTop: 18, padding: 18, borderRadius: 14, background: '#fff8ec', border: '1px solid #f4e2c0' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#8a5a00' }}>
        This wallet needs about {short(missing)} more MON
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.5, color: '#8a6a30' }}>
        Every bid is a real transaction, so you pay your own gas. Send MON to the
        address below — we&apos;re watching it and you&apos;ll join automatically.
      </p>

      <button
        type="button"
        onClick={copy}
        className="btn-plain"
        style={{
          width: '100%', marginTop: 12, padding: '12px 14px', borderRadius: 10,
          border: '1px dashed #d8b978', background: '#fffdf8',
          fontFamily: "'DM Mono', monospace", fontSize: 12.5, color: '#5a4416',
          wordBreak: 'break-all', textAlign: 'center', cursor: 'pointer',
        }}
      >
        {copied ? 'Copied ✓' : funding.address}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
        <span style={{ fontSize: 12.5, color: '#8a6a30' }}>
          Balance: <strong>{short(funding.balance)} MON</strong>
        </span>
        <a
          href={FAUCET}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, fontWeight: 800, color: '#6b2de6' }}
        >
          Testnet faucet ↗
        </a>
      </div>
    </div>
  )
}
