'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readContract } from 'viem/actions'
import { MonadMark, MonadLockup } from '../components/Logo'
import { RaceTrack, racersFromState } from '../components/RaceTrack'
import { useDemoRace } from '../lib/demoRace'
import { useAuction, useCountdown } from '../lib/useAuction'
import { deriveAccount, loadIdentity, saveIdentity, clearIdentity, normalizeName } from '../lib/identity.mjs'
import { Signer, readClient, squadForAddress, requestFunding, waitForArming, CONTRACT } from '../lib/tx.mjs'
import { BIDBLITZ_ABI } from '../lib/abi.mjs'
import { formatAmount, formatMon, incrementLabel, QUICK_INCREMENTS, squadOf, entityLabel, shortAddress } from '../lib/format.mjs'

const EASE = 'cubic-bezier(.2,.7,.2,1)'

export default function Home() {
  const [identity, setIdentity] = useState(null)
  const [signer, setSigner] = useState(null)
  const [me, setMe] = useState({ entityId: 0, purse: 0n, spent: 0n })
  const { state, setWakeHandler } = useAuction({ intervalMs: 1000 })

  useEffect(() => {
    const saved = loadIdentity()
    if (saved?.key) {
      const s = new Signer(saved.key)
      setIdentity(saved)
      setSigner(s)
      s.syncNonce().catch(() => {})
    }
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

  // iOS suspends background tabs. On wake, repair the purse view AND the nonce —
  // a stale nonce means every later bid silently fails.
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#fbfbff 0%,#f1f0f9 46%,#eceaf6 100%)',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#12121c',
        overflowX: 'hidden',
      }}
    >
      <Header joined={Boolean(signer)} identity={identity} onLeave={() => {
        clearIdentity(); setIdentity(null); setSigner(null); setMe({ entityId: 0, purse: 0n, spent: 0n })
      }} />

      <section style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', padding: '60px 0 0' }} className="pad-x">
        <Streaks />

        <div className="hero-grid">
          <HeroCopy state={state} joined={Boolean(signer)} />
          <RaceLane state={state} signer={signer} />
        </div>

        <HowItWorks />
        <div style={{ height: 56 }} />
      </section>

      <About state={state} />
      <Faq />
      <JoinSection
        state={state}
        signer={signer}
        identity={identity}
        me={me}
        refreshMe={refreshMe}
        onJoined={(ident, s) => { setIdentity(ident); setSigner(s); refreshMe() }}
      />
      <Footer />
    </div>
  )
}

/* ---------------------------------------------------------------- header --- */

function Header({ joined, identity, onLeave }) {
  return (
    <header
      className="pad-x"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
        paddingTop: 18, paddingBottom: 18, background: '#ffffff',
        boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MonadMark size={42} />
        <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: '-.02em' }}>
          Bid<span style={{ color: '#6b2de6' }}>Blitz</span>
        </div>
      </div>

      <nav className="nav-links-wrap" style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
        <div className="nav-links">
          <a className="nav-link" href="#how">How it works</a>
          <a className="nav-link" href="#about">About</a>
          <a className="nav-link" href="#faq">FAQ</a>
        </div>

        {joined ? (
          <button
            className="btn-plain"
            onClick={onLeave}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#ebe6fb', color: '#5b28d9', padding: '15px 24px',
              borderRadius: 12, fontWeight: 700, fontSize: 16,
            }}
          >
            <span style={{ width: 9, height: 9, background: '#6b2de6', borderRadius: 2, transform: 'rotate(45deg)' }} />
            {identity?.name}
          </button>
        ) : (
          <a
            className="cta-sm"
            href="#join"
            style={{
              position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 12,
              background: '#6b2de6', color: '#fff', padding: '15px 26px', borderRadius: 12,
              fontWeight: 700, fontSize: 16, boxShadow: '0 10px 24px rgba(107,45,230,.28)',
            }}
          >
            <span>Participate in an Auction</span>
            <span style={{ fontSize: 18 }}>&#8594;</span>
            <Shimmer width="40%" duration="4.2s" />
          </a>
        )}
      </nav>
    </header>
  )
}

function Shimmer({ width = '35%', duration = '3.6s' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, left: 0, width, height: '100%',
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)',
        animation: `om-shimmer ${duration} ease-in-out infinite`,
      }}
    />
  )
}

function Streaks() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        // Rotation on a wrapper so the animation's translate3d doesn't clobber it,
        // which is what happens when both live on one element.
        <div key={i} style={{ position: 'absolute', top: `${8 + i * 13}%`, right: -240, transform: `rotate(${-9 + i * 2.4}deg)` }}>
          <div
            style={{
              height: 1, width: 1400,
              background: 'linear-gradient(90deg,rgba(107,45,230,0),rgba(107,45,230,.16),rgba(107,45,230,0))',
              animation: `om-streak ${7 + i * 1.3}s linear infinite`,
              animationDelay: `${-i * 1.1}s`,
            }}
          />
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ hero --- */

function HeroCopy({ state, joined }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 26,
        animation: `om-rise .7s ${EASE} both`,
      }}
    >
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 9, background: '#ebe6fb',
          color: '#5b28d9', padding: '10px 18px', borderRadius: 999,
          fontWeight: 700, fontSize: 14, letterSpacing: '.12em',
        }}
      >
        <span style={{ width: 9, height: 9, background: '#6b2de6', borderRadius: 2, transform: 'rotate(45deg)', animation: 'om-bolt 2.4s ease-in-out infinite' }} />
        <span>{live ? 'BIDDING NOW' : 'LIVE. FAST. FAIR.'}</span>
      </div>

      {live || sold ? (
        <>
          <h1
            className="hero-h1"
            style={{
              margin: 0, fontFamily: "'Archivo', sans-serif", fontWeight: 900,
              fontSize: 'clamp(44px, 5.4vw, 78px)', lineHeight: '.92', letterSpacing: '-.035em',
              textTransform: 'uppercase', textWrap: 'balance',
            }}
          >
            {state.lname}
          </h1>
          <div>
            <div style={{ fontSize: 14, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700 }}>
              {sold ? 'SOLD FOR' : 'CURRENT BID'}
            </div>
            <div
              style={{
                fontFamily: "'Archivo', sans-serif", fontWeight: 900, lineHeight: 1,
                fontSize: 'clamp(52px,7vw,92px)', letterSpacing: '-.035em',
                color: live && remaining <= 5 ? '#ff4d4d' : '#6b2de6',
              }}
            >
              {formatAmount(highest)}<span style={{ fontSize: '.34em', marginLeft: 10 }}>MON</span>
            </div>
            <div style={{ fontSize: 19, color: '#2a2a3a', marginTop: 8 }}>
              {highest === 0n ? 'No bids yet — open it' : `${entityLabel(state.leadEntity)} leading`}
              {live && <> · <strong>{remaining.toFixed(1)}s</strong></>}
            </div>
          </div>
        </>
      ) : (
        <>
          <h1
            className="hero-h1"
            style={{
              margin: 0, fontFamily: "'Archivo', sans-serif", fontWeight: 900,
              fontSize: 'clamp(52px, 6.4vw, 92px)', lineHeight: '.92', letterSpacing: '-.035em',
              textTransform: 'uppercase', textWrap: 'balance',
            }}
          >
            <span style={{ display: 'block', animation: `om-rise .7s .05s ${EASE} both` }}>Who gets</span>
            <span style={{ display: 'block', animation: `om-rise .7s .16s ${EASE} both` }}>
              there <span style={{ color: '#6b2de6' }}>first?</span>
            </span>
          </h1>

          <p style={{ margin: 0, fontSize: 21, lineHeight: 1.5, color: '#2a2a3a', maxWidth: '30ch', animation: `om-rise .7s .26s ${EASE} both` }}>
            Lightning-fast auctions on Monad. Real-time bidding. Instant settlement. True ownership.
          </p>
        </>
      )}

      <a
        className="cta-lg"
        href="#join"
        style={{
          position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 22,
          background: '#6b2de6', color: '#fff', padding: '22px 34px', borderRadius: 14,
          fontWeight: 700, fontSize: 19, letterSpacing: '.06em',
          boxShadow: '0 18px 40px rgba(107,45,230,.3)',
          animation: `om-rise .7s .34s ${EASE} both, om-pulse 3.4s ease-out infinite`,
        }}
      >
        <span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2, transform: 'rotate(45deg)' }} />
        <span>{joined ? 'PLACE A BID' : 'JOIN THE RACE'}</span>
        <span style={{ fontSize: 22 }}>&#8594;</span>
        <Shimmer />
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 19, color: '#40405a', animation: `om-rise .7s .42s ${EASE} both` }}>
        <span>Built on</span>
        <MonadLockup height={26} />
      </div>
    </div>
  )
}

function RaceLane({ state, signer }) {
  const hasLiveBids = Boolean(state?.racers?.length)

  // The hero is always in motion. Real bids drive it when a lot is running;
  // otherwise the source file's own simulation runs, so the lanes never sit dead
  // still waiting for someone to bid.
  const demo = useDemoRace({ enabled: !hasLiveBids })

  const [flash, setFlash] = useState(null)
  const prevTop = useRef(null)
  const liveRacers = useMemo(
    () => racersFromState(state, { myAddress: signer?.address }),
    [state, signer],
  )

  useEffect(() => {
    if (!hasLiveBids) return
    const top = liveRacers[0]?.key
    if (top && prevTop.current && top !== prevTop.current) {
      setFlash(top)
      const id = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(id)
    }
    prevTop.current = top
  }, [liveRacers, hasLiveBids])

  return (
    <div style={{ position: 'relative' }}>
      <RaceTrack
        racers={hasLiveBids ? liveRacers : demo.racers}
        flashKey={hasLiveBids ? flash : demo.flashKey}
      />
      {!hasLiveBids && (
        <p style={{ margin: '2px 0 0 26px', fontSize: 14, color: '#6b6d78' }}>
          Sample race — real bidders take over these lanes the moment a lot opens.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ how it works --- */

function HowItWorks() {
  const steps = [
    ['01', 'JOIN', 'Enter any live auction in just one click.'],
    ['02', 'BID', 'Place your bids in real-time and stay ahead.'],
    ['03', 'WIN', 'Highest bid when time ends, the item is yours!'],
  ]

  return (
    <div
      id="how"
      className="steps-grid"
      style={{
        marginTop: 66, background: '#fff', borderRadius: 18,
        boxShadow: '0 22px 60px rgba(30,20,70,.08)', overflow: 'hidden',
        animation: `om-rise .8s .5s ${EASE} both`, position: 'relative',
      }}
    >
      {steps.map(([n, title, body], i) => (
        <div
          key={n}
          className="step"
          style={{
            display: 'flex', gap: 22, alignItems: 'flex-start', padding: '34px 36px',
            borderRight: i < 2 ? '1px solid #eeecf7' : 'none',
          }}
        >
          <div
            style={{
              flex: '0 0 auto', width: 66, height: 66, borderRadius: 14, background: '#efeafd',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 22, color: '#6b2de6',
              animation: i === 1 ? 'om-bolt 2.8s ease-in-out infinite' : undefined,
            }}
          >
            {n}
          </div>
          <div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 21, color: '#6b2de6', letterSpacing: '.02em' }}>
              {title}
            </div>
            <div style={{ marginTop: 8, fontSize: 17, lineHeight: 1.45, color: '#2a2a3a' }}>{body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- about --- */

function About({ state }) {
  const stats = [
    ['300ms', 'block time', 'Bids confirm before you lift your thumb.'],
    ['600ms', 'finality', 'Not "probably settled" — actually settled.'],
    ['0', 'installs', 'No wallet, no extension, no seed phrase.'],
  ]

  return (
    <section id="about" style={{ background: '#fff', borderTop: '1px solid #eeecf7' }}>
      <div className="pad-x" style={{ maxWidth: 1440, margin: '0 auto', padding: '76px 0' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#ebe6fb', color: '#5b28d9', padding: '10px 18px', borderRadius: 999, fontWeight: 700, fontSize: 14, letterSpacing: '.12em' }}>
          <span style={{ width: 9, height: 9, background: '#6b2de6', borderRadius: 2, transform: 'rotate(45deg)' }} />
          <span>ABOUT</span>
        </div>

        <h2
          style={{
            margin: '22px 0 0', fontFamily: "'Archivo', sans-serif", fontWeight: 900,
            fontSize: 'clamp(36px,4.4vw,62px)', lineHeight: '.96', letterSpacing: '-.035em',
            textTransform: 'uppercase', maxWidth: '18ch',
          }}
        >
          An auction the whole room <span style={{ color: '#6b2de6' }}>can play</span>
        </h2>

        <p style={{ margin: '22px 0 0', fontSize: 20, lineHeight: 1.55, color: '#2a2a3a', maxWidth: '62ch' }}>
          BidBlitz is an IPL-style player auction where every single bid is a real transaction
          on Monad. Scan a QR, type a name and a password, and you are bidding in about fifteen
          seconds — no wallet install, nothing to download. Your name and password generate your
          wallet on the spot, and retyping them on any device brings it back.
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 20, lineHeight: 1.55, color: '#2a2a3a', maxWidth: '62ch' }}>
          This only works because Monad settles in well under a second. On a slower chain the
          format falls apart — a twenty-second lot cannot wait twelve seconds for a confirmation.
          Speed here is not a benchmark on a slide, it is the mechanic the room is watching.
        </p>

        <div className="about-grid" style={{ marginTop: 46 }}>
          {stats.map(([big, label, body]) => (
            <div key={label} style={{ padding: '28px 30px', borderRadius: 18, background: '#faf8ff', border: '1px solid #eeecf7' }}>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 46, letterSpacing: '-.035em', color: '#6b2de6' }}>
                {big}
              </div>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '.14em', textTransform: 'uppercase', color: '#40405a', marginTop: 2 }}>
                {label}
              </div>
              <div style={{ marginTop: 12, fontSize: 16, lineHeight: 1.45, color: '#2a2a3a' }}>{body}</div>
            </div>
          ))}
        </div>

        {state?.blockNumber > 0 && (
          <div style={{ marginTop: 26, fontFamily: "'DM Mono', monospace", fontSize: 15, color: '#6b6d78' }}>
            live · Monad testnet block #{Number(state.blockNumber).toLocaleString()}
          </div>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- faq --- */

const FAQS = [
  ['Do I need a crypto wallet?', 'No. Your name and password generate a burner wallet right in the browser, and it is funded for you automatically. Nothing to install, no seed phrase to write down.'],
  ['Is this real money?', 'No. Everything runs on Monad testnet with test MON that has no value. Bid amounts are accounting units in the auction contract.'],
  ['What if I close the tab or my phone dies?', 'Type the same name and password again, on any device. That regenerates the exact same wallet — it is the whole recovery mechanism, and there is no account database behind it.'],
  ['How do I know the auction is fair?', 'Every bid is a transaction and every sale emits an on-chain event. You can open the block explorer and read who won and for how much without trusting this app at all.'],
  ['What happens when I win a lot?', 'The winning purse is debited and a soulbound winner badge is minted to your address. It is non-transferable — permanent proof you took that lot.'],
  ['Can I use MetaMask instead?', 'Yes, if you already have it. The burner wallet is the default because it gets a stranger bidding in fifteen seconds, but the contract does not care which wallet signs.'],
  ['Why does my bid sometimes not go through?', 'Someone beat you to it. Bids must strictly beat the current highest, and ties are broken by block order — first transaction in wins, deterministically.'],
]

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" style={{ background: 'linear-gradient(180deg,#eceaf6 0%,#f4f2fb 100%)' }}>
      <div className="pad-x" style={{ maxWidth: 1000, margin: '0 auto', padding: '76px 0' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#ebe6fb', color: '#5b28d9', padding: '10px 18px', borderRadius: 999, fontWeight: 700, fontSize: 14, letterSpacing: '.12em' }}>
          <span style={{ width: 9, height: 9, background: '#6b2de6', borderRadius: 2, transform: 'rotate(45deg)' }} />
          <span>FAQ</span>
        </div>

        <h2
          style={{
            margin: '22px 0 34px', fontFamily: "'Archivo', sans-serif", fontWeight: 900,
            fontSize: 'clamp(36px,4.4vw,62px)', lineHeight: '.96', letterSpacing: '-.035em',
            textTransform: 'uppercase',
          }}
        >
          Questions, <span style={{ color: '#6b2de6' }}>answered</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i
            return (
              <div
                key={q}
                className="faq-item"
                style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 16, overflow: 'hidden' }}
              >
                <button
                  className="btn-plain"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 20, padding: '22px 26px', background: 'transparent', textAlign: 'left',
                    fontWeight: 700, fontSize: 18, color: '#12121c',
                  }}
                >
                  <span>{q}</span>
                  <span
                    style={{
                      flex: '0 0 auto', width: 30, height: 30, borderRadius: 9, background: '#efeafd',
                      display: 'grid', placeItems: 'center', color: '#6b2de6', fontSize: 18, fontWeight: 800,
                      transform: isOpen ? 'rotate(45deg)' : 'none', transition: `transform .3s ${EASE}`,
                    }}
                  >
                    +
                  </span>
                </button>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    transition: `grid-template-rows .32s ${EASE}`,
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ margin: 0, padding: '0 26px 22px', fontSize: 17, lineHeight: 1.55, color: '#2a2a3a', maxWidth: '68ch' }}>
                      {a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ join --- */

function JoinSection({ state, signer, identity, me, refreshMe, onJoined }) {
  return (
    <section id="join" style={{ background: '#fff', borderTop: '1px solid #eeecf7' }}>
      <div className="pad-x" style={{ maxWidth: 1000, margin: '0 auto', padding: '76px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              margin: 0, fontFamily: "'Archivo', sans-serif", fontWeight: 900,
              fontSize: 'clamp(36px,4.6vw,66px)', lineHeight: '.94', letterSpacing: '-.035em',
              textTransform: 'uppercase',
            }}
          >
            {signer ? <>You&apos;re <span style={{ color: '#6b2de6' }}>in</span></> : <>Get in the <span style={{ color: '#6b2de6' }}>race</span></>}
          </h2>
          <p style={{ margin: '16px auto 0', fontSize: 19, lineHeight: 1.5, color: '#2a2a3a', maxWidth: '46ch' }}>
            {signer
              ? 'Bid from here, or from your phone — same name and password gets you the same wallet.'
              : 'Two fields. No wallet, no install. You will be bidding in about fifteen seconds.'}
          </p>
        </div>

        <div style={{ maxWidth: 460, margin: '32px auto 0' }}>
          {signer ? (
            <BidPanel state={state} signer={signer} me={me} refreshMe={refreshMe} />
          ) : (
            <JoinForm onJoined={onJoined} />
          )}
        </div>
      </div>
    </section>
  )
}

function JoinForm({ onJoined }) {
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
      // this is them coming back — skip funding entirely.
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

      // Monad derives an account's inflight gas budget from state 3 blocks back,
      // so a freshly funded wallet's first bid is excluded at consensus —
      // silently, with no receipt and no revert. Wait it out.
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
    <form onSubmit={submit} style={{ background: '#faf8ff', border: '1px solid #eeecf7', borderRadius: 18, padding: 26 }}>
      <label style={{ display: 'block', fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>YOUR NAME</label>
      <input className="field" style={{ marginTop: 8 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul" autoComplete="off" maxLength={40} required />

      <label style={{ display: 'block', marginTop: 16, fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>PASSWORD</label>
      <input className="field" style={{ marginTop: 8 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="something only you know" autoComplete="new-password" minLength={4} required />

      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: '#6b6d78' }}>
        These two generate your wallet. <strong>Don&apos;t reuse a real password</strong> — this is testnet play money.
      </p>

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
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#6b2de6', color: '#fff', padding: '20px 28px', borderRadius: 14,
          fontWeight: 700, fontSize: 18, letterSpacing: '.06em',
          boxShadow: '0 18px 40px rgba(107,45,230,.3)',
        }}
      >
        <span>{busy ? status : 'JOIN THE RACE'}</span>
        {!busy && <span style={{ fontSize: 22 }}>&#8594;</span>}
        {!busy && <Shimmer />}
      </button>

      {error && <p style={{ margin: '12px 0 0', color: '#c0392b', fontSize: 14, wordBreak: 'break-word' }}>{error}</p>}
      {preview && !busy && (
        <p style={{ margin: '10px 0 0', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b6d78' }}>{preview}</p>
      )}
    </form>
  )
}

function BidPanel({ state, signer, me, refreshMe }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const highest = BigInt(state?.highestBid || 0)
  const squad = squadOf(me.entityId)

  const [pending, setPending] = useState(false)
  const [flash, setFlash] = useState(null)
  const lockedUntil = useRef(0)

  const nextBid = (inc) => highest + inc

  async function bid(inc) {
    const now = Date.now()
    if (pending || now < lockedUntil.current || !live) return
    lockedUntil.current = now + 400 // a double-tap must not become two paid transactions

    const amount = nextBid(inc)

    // Stale-bid guard. A reverted transaction still costs full gas on Monad, so
    // submitting a bid we already know is too low burns real MON for nothing.
    if (amount <= highest) return setFlash({ kind: 'stale', text: `Someone beat you to ${formatMon(highest)}` })
    if (amount > BigInt(me.purse)) return setFlash({ kind: 'stale', text: 'Not enough purse left' })

    setPending(true); setFlash(null)
    try {
      navigator.vibrate?.(30)
      await signer.placeBid(state.lotId, amount)
      setFlash({ kind: 'sent', text: `${formatMon(amount)} sent` })
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

  return (
    <div style={{ background: '#faf8ff', border: '1px solid #eeecf7', borderRadius: 18, padding: 26 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderRadius: 12, background: squad ? `${squad.color}22` : '#efeafd',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: squad?.color || '#6b2de6' }} />
          {entityLabel(me.entityId)}
        </span>
        <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 22 }}>
          {formatAmount(me.purse)} <span style={{ fontSize: 13, color: '#6b2de6' }}>MON</span>
        </span>
      </div>

      {live && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', fontWeight: 700 }}>TIME LEFT</div>
          <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 40, color: remaining <= 5 ? '#ff4d4d' : '#12121c' }}>
            {remaining.toFixed(1)}s
          </div>
          <div style={{ height: 6, background: '#eeecf7', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', width: `${Math.min(100, (remaining / 20) * 100)}%`, background: remaining <= 5 ? '#ff4d4d' : '#6b2de6', transition: 'width .1s linear' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 16 }}>
        {QUICK_INCREMENTS.map((inc) => (
          <button
            key={inc.toString()}
            className="btn-plain"
            onClick={() => bid(inc)}
            disabled={!live || pending}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: '#6b2de6', color: '#fff', padding: '14px 4px', borderRadius: 12,
              boxShadow: '0 10px 24px rgba(107,45,230,.28)',
            }}
          >
            <span style={{ fontSize: 11, opacity: .75, fontWeight: 600 }}>{incrementLabel(inc)}</span>
            <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 17 }}>
              {formatAmount(nextBid(inc))}
            </span>
          </button>
        ))}
      </div>

      {flash && (
        <div
          style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: flash.kind === 'error' ? '#fdecea' : flash.kind === 'stale' ? '#fff6e5' : '#e9f9ef',
            color: flash.kind === 'error' ? '#c0392b' : flash.kind === 'stale' ? '#8a5a00' : '#12703a',
          }}
        >
          {flash.text}
        </div>
      )}
      {!live && (
        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 14, color: '#6b6d78' }}>
          {state?.sold ? 'Lot closed — next one coming up.' : 'Waiting for the next lot to open…'}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- footer --- */

function Footer() {
  return (
    <footer style={{ background: '#12121c', color: '#fff' }}>
      <div
        className="pad-x"
        style={{
          maxWidth: 1440, margin: '0 auto', padding: '44px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MonadMark size={32} />
          <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>
            Bid<span style={{ color: '#a983ff' }}>Blitz</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 15, color: 'rgba(255,255,255,.65)' }}>
          <a href="#how" style={{ color: 'rgba(255,255,255,.65)' }}>How it works</a>
          <a href="#about" style={{ color: 'rgba(255,255,255,.65)' }}>About</a>
          <a href="#faq" style={{ color: 'rgba(255,255,255,.65)' }}>FAQ</a>
          <a href="/screen" style={{ color: 'rgba(255,255,255,.65)' }}>Big screen</a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: 'rgba(255,255,255,.65)' }}>
          <span>Built on</span>
          <MonadLockup height={22} inverted />
        </div>
      </div>
    </footer>
  )
}
