'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BidBlitzMark, MonadLockup } from '../components/Logo'
import { RaceTrack } from '../components/RaceTrack'
import { JoinCard } from '../components/JoinCard'
import { useDemoRace } from '../lib/demoRace'
import { useSession } from '../lib/useSession'
import { roomCode, roomIdFromCode, sanitizeRoomName } from '../lib/room.mjs'
import { formatAmount } from '../lib/format.mjs'
import { CATEGORIES, modeForCategories, isCustomCat, makeCustomCat, catLabel } from '../lib/categories.mjs'

const EASE = 'cubic-bezier(.2,.7,.2,1)'

export default function Home() {
  const session = useSession(null)

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
      <Header session={session} />

      <section style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', paddingTop: 60 }} className="pad-x">
        <Streaks />
        <div className="hero-grid">
          <HeroCopy />
          <RaceLane />
        </div>
        <HowItWorks />
        <div style={{ height: 56 }} />
      </section>

      <HostOrJoin />
      <About />
      <Faq />
      <Footer />
    </div>
  )
}

/* ---------------------------------------------------------------- header --- */

function Header({ session }) {
  return (
    <header
      style={{
        background: '#ffffff', boxShadow: '0 1px 0 rgba(18,18,28,.06)',
        position: 'sticky', top: 0, zIndex: 30,
      }}
    >
      {/* Same 1440 container as every section, so the logo sits on the same left
          edge as the headline instead of hugging the window. */}
      <div
        className="pad-x"
        style={{
          maxWidth: 1440, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
          paddingTop: 18, paddingBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BidBlitzMark size={42} />
          <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: '-.02em' }}>
            Bid<span style={{ color: '#6b2de6' }}>Blitz</span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
          <div className="nav-links">
            <a className="nav-link" href="#how">How it works</a>
            <a className="nav-link" href="#about">About</a>
            <a className="nav-link" href="#faq">FAQ</a>
            <a className="nav-link" href="/account">History &amp; login</a>
            <a className="nav-link" href="/demo">Try demo</a>
          </div>
          <a
            className="cta-sm"
            href="#start"
            style={{
              position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 12,
              background: '#6b2de6', color: '#fff', padding: '15px 26px', borderRadius: 12,
              fontWeight: 700, fontSize: 16, boxShadow: '0 10px 24px rgba(107,45,230,.28)',
            }}
          >
            <span>Host or Join</span>
            <span style={{ fontSize: 18 }}>&#8594;</span>
            <Shimmer width="40%" duration="4.2s" />
          </a>
        </nav>
      </div>
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
        // Rotation on a wrapper so the animation's translate3d doesn't clobber
        // it, which is what happens when both live on one element.
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

function HeroCopy() {
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
        <span>LIVE. FAST. FAIR.</span>
      </div>

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
        Host a live auction on anything — memes, NFTs, fantasy leagues, whatever.
        Share a code, and the whole room bids in real time on Monad.
      </p>

      <a
        className="cta-lg"
        href="#start"
        style={{
          position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 22,
          background: '#6b2de6', color: '#fff', padding: '22px 34px', borderRadius: 14,
          fontWeight: 700, fontSize: 19, letterSpacing: '.06em',
          boxShadow: '0 18px 40px rgba(107,45,230,.3)',
          animation: `om-rise .7s .34s ${EASE} both, om-pulse 3.4s ease-out infinite`,
        }}
      >
        <span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2, transform: 'rotate(45deg)' }} />
        <span>JOIN THE RACE</span>
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

function RaceLane() {
  const demo = useDemoRace({ enabled: true })
  return (
    <div style={{ position: 'relative' }}>
      <RaceTrack racers={demo.racers} flashKey={demo.flashKey} />
      <p style={{ margin: '2px 0 0 26px', fontSize: 14, color: '#6b6d78' }}>
        Sample race — every lane in a real room is a live on-chain bid.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ host / join --- */

function HostOrJoin() {
  return (
    <section id="start" style={{ background: '#fff', borderTop: '1px solid #eeecf7' }}>
      <div className="pad-x" style={{ maxWidth: 1000, margin: '0 auto', paddingTop: 76, paddingBottom: 76 }}>
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              margin: 0, fontFamily: "'Archivo', sans-serif", fontWeight: 900,
              fontSize: 'clamp(36px,4.6vw,66px)', lineHeight: '.94', letterSpacing: '-.035em',
              textTransform: 'uppercase',
            }}
          >
            Host one, or <span style={{ color: '#6b2de6' }}>join one</span>
          </h2>
          <p style={{ margin: '16px auto 0', fontSize: 19, lineHeight: 1.5, color: '#2a2a3a', maxWidth: '48ch' }}>
            Auction memes, NFTs, games, cards, art, a fantasy league, or your own custom
            lineup. Create a room, share the four-character code, and everyone else is
            bidding in seconds.
          </p>
          <p style={{ margin: '10px auto 0', fontSize: 16, lineHeight: 1.5, color: '#6b6d78', maxWidth: '52ch' }}>
            Two ways to run it: <strong style={{ color: '#12703a' }}>Free</strong> costs nobody
            anything and needs no wallet. <strong style={{ color: '#6b2de6' }}>MON</strong> puts
            every bid on-chain, where everyone spends their own.
          </p>
        </div>

        {/* Two distinct kinds of room — Fantasy League is its own thing, not a
            category buried in an auction. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 30, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
          <Link
            href="/host?chain=free&kind=auction"
            style={{
              textAlign: 'left', padding: '22px 24px', borderRadius: 18, background: '#12703a', color: '#fff',
              boxShadow: '0 18px 40px rgba(18,112,58,.28)', display: 'block',
            }}
          >
            <div style={{ fontSize: 30 }}>🎉</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 21, marginTop: 8 }}>Host a Free room</div>
            <div style={{ fontSize: 14, opacity: .9, marginTop: 4, lineHeight: 1.4 }}>Just for fun. No wallet, no MON, no gas — for you or anyone who joins.</div>
          </Link>

          <Link
            href="/host?chain=mon&kind=auction"
            style={{
              textAlign: 'left', padding: '22px 24px', borderRadius: 18, background: '#6b2de6', color: '#fff',
              boxShadow: '0 18px 40px rgba(107,45,230,.3)', display: 'block',
            }}
          >
            <div style={{ fontSize: 30 }}>⛓</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 21, marginTop: 8 }}>Host a MON auction</div>
            <div style={{ fontSize: 14, opacity: .85, marginTop: 4, lineHeight: 1.4 }}>Every bid a Monad transaction. Winning bid is paid to you.</div>
          </Link>

          <Link
            href="/host?chain=free&kind=fantasy"
            style={{
              textAlign: 'left', padding: '22px 24px', borderRadius: 18, background: '#fff', color: '#12121c',
              border: '2px solid #e6e2f5', display: 'block',
            }}
          >
            <div style={{ fontSize: 30 }}>🏏</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 21, marginTop: 8, color: '#5b28d9' }}>Fantasy League</div>
            <div style={{ fontSize: 14, color: '#6b6d78', marginTop: 4, lineHeight: 1.4 }}>A four-team draft — squads share a purse. Its own mode.</div>
          </Link>

          <Link
            href="/demo"
            style={{
              textAlign: 'left', padding: '22px 24px', borderRadius: 18, background: '#fff', color: '#12121c',
              border: '2px solid #e6e2f5', display: 'block',
            }}
          >
            <div style={{ fontSize: 30 }}>🎮</div>
            <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 21, marginTop: 8, color: '#5b28d9' }}>Play Solo</div>
            <div style={{ fontSize: 14, color: '#6b6d78', marginTop: 4, lineHeight: 1.4 }}>Practice against bots — be the host or a bidder. No room, no wallet needed.</div>
          </Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/host?tab=join" style={{ fontWeight: 700, color: '#5b28d9' }}>or join a room with a code →</Link>
        </div>
        {/* No public room list on purpose — events are unlisted and reached only
            by their code or QR, so a host can run a private event that is never
            mentioned on the site. */}
      </div>
    </section>
  )
}

function Lobby() {
  const [rooms, setRooms] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/rooms?limit=8', { cache: 'no-store' })
        if (!res.ok) return alive && setRooms([])
        const { rooms = [] } = await res.json()
        if (alive) setRooms(rooms)
      } catch {
        if (alive) setRooms([])
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (!rooms?.length) return null

  return (
    <div style={{ marginTop: 46 }}>
      <h3 style={{ fontSize: 12, letterSpacing: '.16em', color: '#6b6d78', margin: '0 0 12px', fontWeight: 700 }}>
        LIVE ROOMS
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {rooms.map((r) => {
          const open = Number(r.openLot) !== 0
          return (
            <Link
              key={r.roomId}
              href={`/r/${roomCode(r.roomId)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: '#fff', border: '1px solid #eeecf7', borderRadius: 14, color: '#12121c',
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 15, letterSpacing: '.16em',
                  color: '#6b2de6', background: '#efeafd', padding: '8px 12px', borderRadius: 10,
                }}
              >
                {roomCode(r.roomId)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.rname || `Room ${roomCode(r.roomId)}`}
                </span>
                <span style={{ fontSize: 13, color: '#6b6d78' }}>
                  {Number(r.lotCount)} lot{Number(r.lotCount) === 1 ? '' : 's'} · {Number(r.entityCount)} bidders
                </span>
              </span>
              {open && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                    fontWeight: 700, letterSpacing: '.1em', color: '#ff4d4d',
                    background: 'rgba(255,77,77,.12)', padding: '6px 10px', borderRadius: 999,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: '#ff4d4d', animation: 'om-bolt 1.4s ease-in-out infinite' }} />
                  LIVE
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ how it works --- */

function HowItWorks() {
  const steps = [
    ['01', 'HOST', 'Pick your categories — memes, NFTs, fantasy, custom — and share the room code.'],
    ['02', 'BID', 'Every tap is a real transaction, confirmed in under a second.'],
    ['03', 'WIN', 'Highest bid when time ends takes the lot — provably, on-chain.'],
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

function About() {
  const stats = [
    ['300ms', 'block time', 'Bids confirm before you lift your thumb.'],
    ['600ms', 'finality', 'Not "probably settled" — actually settled.'],
    ['0', 'installs', 'No wallet, no extension, no seed phrase.'],
  ]

  return (
    <section id="about" style={{ background: '#faf8ff', borderTop: '1px solid #eeecf7' }}>
      <div className="pad-x" style={{ maxWidth: 1440, margin: '0 auto', paddingTop: 76, paddingBottom: 76 }}>
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
          BidBlitz is an IPL-style auction where every single bid is a real
          transaction on Monad. Anyone can host a room; everyone else scans a QR,
          types a name and a password, and is bidding in about fifteen seconds.
          Your name and password generate your wallet on the spot, and retyping
          them on any device brings it back.
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 20, lineHeight: 1.55, color: '#2a2a3a', maxWidth: '62ch' }}>
          This only works because Monad settles in well under a second. On a
          slower chain the format falls apart — a twenty-second lot cannot wait
          twelve seconds for a confirmation. Speed here is not a benchmark on a
          slide, it is the mechanic the room is watching.
        </p>

        <div className="about-grid" style={{ marginTop: 46 }}>
          {stats.map(([big, label, body]) => (
            <div key={label} style={{ padding: '28px 30px', borderRadius: 18, background: '#fff', border: '1px solid #eeecf7' }}>
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
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- faq --- */

const FAQS = [
  ['Do I need a crypto wallet?', 'Only for a MON room. Free rooms need nothing at all — pick a name and a face and you are bidding, because nothing in them is on-chain and nobody spends anything. A MON room does need a wallet (MetaMask, Rabby, OKX or Backpack) with some testnet MON in it, since every bid is a real transaction you pay for yourself. Lace will not work — it is a Cardano wallet and cannot talk to an EVM chain like Monad.'],
  ['How do I host my own auction?', 'Hit Host a room and first choose Free or MON. Name it, pick categories, and share the four-character code. In a MON room the wallet that creates it becomes its host, and only that wallet can start or sell lots — enforced by the contract, so there is no admin password to share or lose. A free room is hosted by the browser that created it, so run it from that device.'],
  ['Free vs MON — what is the difference?', 'A Free room is off-chain: bids are points, nothing is written to a chain, and it costs nobody anything — not you, not your guests, not us. A MON room puts every bid on Monad as a real transaction, so each person spends their own MON and their own gas; with Real payout the winning bid is escrowed and paid to the host while outbid bidders are refunded. Free rooms have to be off-chain to be free — on Monad even a play-money bid costs gas, so somebody would have to be paying.'],
  ['Is this real money?', 'It is real testnet MON, which has no cash value — but in a Real-payout room it genuinely moves on-chain: escrowed on each bid, refunded on an outbid, and paid to the host on a sale. Play-money rooms move nothing.'],
  ['How does the host get paid, and how do I get a refund?', 'In a Real-payout room, selling a lot credits the winning bid to the host on-chain; hit Collect in the host console to withdraw it to your wallet. If you were outbid, Claim refund in the room returns your MON. Both produce a transaction you can open on the explorer.'],
  ['Who pays for all this?', 'Whoever is transacting. BidBlitz holds no treasury and has no server-side wallet, so it cannot fund anyone even if it wanted to: in a MON room the host pays gas for the lots they start and sell, and each bidder pays for their own bids. Free rooms cost nothing because nothing in them touches a chain.'],
  ['Can I see the transactions live?', 'Yes. Every room has a live history at /r/<code>/history, built straight from on-chain events — every bid, sale, refund and withdrawal links to the real Monad transaction. Hosts and bidders can both watch it.'],
  ['What if I close the tab or my phone dies?', 'Type the same name and password again, on any device. That regenerates the exact same wallet — it is the whole recovery mechanism, and there is no account database behind it.'],
  ['What happens when I win a lot?', 'A soulbound winner badge is minted to your address (non-transferable proof you took that lot). In a play-money room your purse is debited; in a real-payout room your escrowed bid goes to the host.'],
  ['Why did my bid not go through?', 'Someone beat you to it. Bids must strictly beat the current highest, and ties are broken by block order — the first transaction in wins, deterministically.'],
]

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" style={{ background: 'linear-gradient(180deg,#eceaf6 0%,#f4f2fb 100%)' }}>
      <div className="pad-x" style={{ maxWidth: 1000, margin: '0 auto', paddingTop: 76, paddingBottom: 76 }}>
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
              <div key={q} className="faq-item" style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 16, overflow: 'hidden' }}>
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
                <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: `grid-template-rows .32s ${EASE}` }}>
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

/* ---------------------------------------------------------------- footer --- */

function Footer() {
  return (
    <footer style={{ background: '#12121c', color: '#fff' }}>
      <div
        className="pad-x"
        style={{
          maxWidth: 1440, margin: '0 auto', paddingTop: 44, paddingBottom: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BidBlitzMark size={32} />
          <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>
            Bid<span style={{ color: '#a983ff' }}>Blitz</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 15 }}>
          <a href="#how" style={{ color: 'rgba(255,255,255,.65)' }}>How it works</a>
          <a href="#about" style={{ color: 'rgba(255,255,255,.65)' }}>About</a>
          <a href="#faq" style={{ color: 'rgba(255,255,255,.65)' }}>FAQ</a>
          <a href="#start" style={{ color: 'rgba(255,255,255,.65)' }}>Host or join</a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: 'rgba(255,255,255,.65)' }}>
          <span>Built on</span>
          <MonadLockup height={22} inverted />
        </div>
      </div>
    </footer>
  )
}
