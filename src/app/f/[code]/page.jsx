'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BidBlitzMark } from '../../../components/Logo'
import { RaceTrack, racersFromState } from '../../../components/RaceTrack'
import { BidBar } from '../../../components/BidBar'
import { TeamStandings } from '../../../components/TeamStandings'
import { Avatar, AVATAR_SEEDS } from '../../../components/Avatar'
import { PointsShop } from '../../../components/PointsShop'
import { useCountdown } from '../../../lib/useAuction'
import { useFreeState, useFreeSession } from '../../../lib/useFreeRoom'
import { normalizeCode } from '../../../lib/freeRoom.mjs'
import { formatAmount, entityLabel, entityColor } from '../../../lib/format.mjs'
import { shortAddress } from '../../../lib/format.mjs'
import { isSquads } from '../../../lib/modes.mjs'
import { useAuth } from '../../../lib/useAuth'

/**
 * A FREE room: real strangers, real-time bidding, no wallet and no MON.
 *
 * Structurally this is the on-chain room page with the chain taken out. It
 * shares the bid bar, race track and standings deliberately — the only things
 * that differ are where state comes from and the fact that nothing here is
 * worth anything, which the UI says out loud rather than hiding.
 */
export default function FreeRoom({ params }) {
  const { code: raw } = use(params)
  const code = normalizeCode(raw)

  const { state, error } = useFreeState({ code, intervalMs: 900 })
  const session = useFreeSession(code)
  const { signer, me, joined, syncFrom } = session

  // Purses only move when a lot sells, so they ride along with the state poll
  // instead of needing one of their own.
  useEffect(() => { syncFrom(state) }, [state, syncFrom])

  const closed = Boolean(state?.closed)

  // A player the host removed vanishes from the roster while their browser
  // still believes it is in the room. Detect it from the roster rather than
  // waiting for their next bid to be refused.
  const removed = Boolean(
    joined && state?.players && !state.players.some((p) => p.addr === session.player?.addr),
  )

  if (error === 'room not found') return <Missing code={code} />

  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff 0%,#f1f0f9 46%,#eceaf6 100%)' }}>
      <RoomHeader state={state} code={code} session={session} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 20px 0' }}>
        {closed ? (
          <Ended state={state} myAddr={session.player?.addr} />
        ) : removed ? (
          <Removed onLeave={session.leave} />
        ) : !joined ? (
          <FreeJoinCard session={session} roomName={state?.rname} />
        ) : (
          <>
            <PointsShop
              code={code}
              playerId={session.player?.addr}
              onCredited={session.applyCredit}
            />
            <LiveRoom state={state} signer={signer} me={me} />
          </>
        )}
      </div>

      {joined && !closed && !removed && (
        <BidBar
          state={state} signer={signer} me={me} roomId={code}
          refreshMe={() => {}} unit="PTS"
        />
      )}
    </main>
  )
}

/** A session that just stops has no ending; this gives everyone the same one. */
function Ended({ state, myAddr }) {
  const players = [...(state?.players ?? [])].sort(
    (a, b) => (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1),
  )
  const champ = players[0]

  return (
    <div style={{ maxWidth: 520, margin: '10px auto 40px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.22em', color: '#6b6d78', fontWeight: 800 }}>
          AUCTION ENDED
        </div>
        {champ && champ.wins > 0 ? (
          <>
            <div style={{ marginTop: 16 }}><Avatar seed={champ.avatarSeed || champ.addr} size={80} /></div>
            <h1
              style={{
                fontFamily: "'Archivo',sans-serif", fontWeight: 900, letterSpacing: '-.035em',
                textTransform: 'uppercase', fontSize: 'clamp(30px,6vw,44px)', margin: '12px 0 0', lineHeight: .98,
              }}
            >
              {champ.addr === myAddr ? 'You won it' : champ.name || entityLabel(champ.entityId)}
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 16, color: '#12703a', fontWeight: 700 }}>
              {champ.wins} lot{champ.wins === 1 ? '' : 's'} won
            </p>
          </>
        ) : (
          <p style={{ margin: '16px 0 0', fontSize: 17, color: '#6b6d78' }}>No lots were sold.</p>
        )}
      </div>

      <div style={{ marginTop: 24, background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 16 }}>
        {players.map((p, i) => {
          const mine = p.addr === myAddr
          return (
            <div
              key={p.addr}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 11,
                background: mine ? '#efeafd' : 'transparent',
              }}
            >
              <span style={{ width: 20, fontFamily: "'DM Mono',monospace", fontSize: 13, color: '#9c94bd', fontWeight: 700 }}>{i + 1}</span>
              <Avatar seed={p.avatarSeed || p.addr} size={30} />
              <span style={{ fontWeight: 700, fontSize: 14.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name || shortAddress(p.addr)}{mine ? ' (you)' : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b6d78' }}>
                {formatAmount(p.spent)} spent
              </span>
              <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 17, color: p.wins ? '#12703a' : '#c9c3dd', minWidth: 26, textAlign: 'right' }}>
                {p.wins}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <Link className="btn" href="/host">Host your own</Link>
      </div>
    </div>
  )
}

function Removed({ onLeave }) {
  return (
    <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
      <BidBlitzMark size={48} style={{ opacity: .35 }} />
      <h1
        style={{
          fontFamily: "'Archivo',sans-serif", fontWeight: 900, fontSize: 30,
          letterSpacing: '-.03em', textTransform: 'uppercase', margin: '16px 0 8px',
        }}
      >
        You were removed
      </h1>
      <p style={{ color: '#6b6d78', fontSize: 16, margin: '0 0 22px', lineHeight: 1.5 }}>
        The host took you out of this room. Nothing you bid counted.
      </p>
      <button className="btn-plain" onClick={onLeave} style={{ padding: '13px 22px', borderRadius: 12, background: '#6b2de6', color: '#fff', fontWeight: 800, fontSize: 15 }}>
        Leave the room
      </button>
    </div>
  )
}

function RoomHeader({ state, code, session }) {
  return (
    <header style={{ background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)', position: 'sticky', top: 0, zIndex: 30 }}>
      <div
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <BidBlitzMark size={30} />
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block', fontFamily: "'Archivo', sans-serif", fontWeight: 800,
                fontSize: 17, letterSpacing: '-.02em', color: '#12121c',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
              }}
            >
              {state?.rname || 'BidBlitz'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.12em' }}>
                {code}
              </span>
              <FreeBadge />
            </span>
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session.isHost && (
            <Link
              href={`/f/${code}/host`}
              style={{ background: '#12121c', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14 }}
            >
              Host controls
            </Link>
          )}
          <a
            href={`/f/${code}/history`} target="_blank" rel="noreferrer"
            style={{ fontSize: 14, fontWeight: 700, color: '#6b6d78' }}
          >
            History ↗
          </a>
          <a
            href={`/f/${code}/screen`} target="_blank" rel="noreferrer"
            style={{ fontSize: 14, fontWeight: 700, color: '#6b6d78' }}
          >
            Screen ↗
          </a>
          {session.player && (
            <button
              className="btn-plain"
              onClick={session.leave}
              style={{
                background: '#ebe6fb', color: '#5b28d9', padding: '10px 14px',
                borderRadius: 10, fontWeight: 700, fontSize: 14,
                maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {session.player.name || 'You'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

function FreeBadge({ small = false }) {
  return (
    <span
      style={{
        fontSize: small ? 9 : 10, fontWeight: 800, letterSpacing: '.12em',
        color: '#12703a', background: '#e9f9ef', padding: '2px 7px', borderRadius: 999,
      }}
    >
      FREE
    </span>
  )
}

function FreeJoinCard({ session, roomName }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0])
  const [error, setError] = useState('')

  // Randomise after mount only — SSR and the first client render must agree or
  // React throws a hydration mismatch.
  useEffect(() => {
    setAvatarSeed(AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)])
  }, [])

  // Someone already signed in should not retype who they are.
  useEffect(() => {
    if (user?.email && !name) setName(user.email.split('@')[0].slice(0, 40))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const busy = Boolean(session.status)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    try {
      await session.join({ name: name.trim(), avatarSeed })
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
          One field and a face. Free to play — no wallet and no MON needed to bid.
        </p>
      </div>

      <form
        onSubmit={submit}
        style={{ background: '#fff', border: '1px solid #eeecf7', borderRadius: 18, padding: 24, boxShadow: '0 22px 60px rgba(30,20,70,.08)' }}
      >
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, letterSpacing: '.1em', color: '#6b6d78' }}>
          YOUR NAME
        </label>
        <input
          className="field" style={{ marginTop: 8 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Rahul"
          autoComplete="off" maxLength={40} required
        />

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

        <button
          className="btn-plain cta-lg"
          disabled={busy}
          style={{
            width: '100%', marginTop: 20,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            background: '#12703a', color: '#fff', padding: '20px 26px', borderRadius: 14,
            fontWeight: 700, fontSize: 18, letterSpacing: '.05em',
            boxShadow: '0 18px 40px rgba(18,112,58,.28)', opacity: busy ? .7 : 1,
          }}
        >
          {busy ? session.status : <>JOIN FOR FREE <span style={{ fontSize: 20 }}>&#8594;</span></>}
        </button>

        {/* Optional, and said as such. An account only decides whether this
            room is still in your history tomorrow — it changes no rule of the
            game, and the join button above works either way. */}
        {user ? (
          <p style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 10, background: '#e9f9ef', color: '#12703a', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}>
            ✓ Signed in — this room will be saved to your history
          </p>
        ) : (
          <div style={{ margin: '14px 0 0', padding: '12px 13px', borderRadius: 11, background: '#fbfaff', border: '1px dashed #ddd6f3' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#6b6d78' }}>
              Playing as a guest. Your wins live in this browser only — clear it or
              switch phones and they&apos;re gone.{' '}
              <Link href="/account" style={{ color: '#5b28d9', fontWeight: 800 }}>
                Log in to keep your history →
              </Link>
            </div>
          </div>
        )}

        <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#9c94bd', textAlign: 'center' }}>
          Points in this room are just points — nothing here is on-chain. You can buy
          extra points with MON if you want a bigger paddle, but you never have to,
          and everyone starts equal.
        </p>

        {error && <p style={{ margin: '14px 0 0', color: '#c0392b', fontSize: 14 }}>{error}</p>}
      </form>
    </div>
  )
}

function LiveRoom({ state, signer, me }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const paddleColor = entityColor(me.entityId, state?.mode)

  const participants = useMemo(() => {
    const map = new Map()
    for (const p of state?.players ?? []) {
      map.set(p.addr.toLowerCase(), { name: p.name, avatar_seed: p.avatarSeed })
    }
    return map
  }, [state?.players])

  // Prefer the name someone chose over a paddle number — the roster has it.
  const leaderName = state?.bidder
    ? participants.get(state.bidder.toLowerCase())?.name || entityLabel(state.leadEntity, state?.mode)
    : null

  const [flash, setFlash] = useState(null)
  const prevTop = useRef(null)
  const racers = useMemo(
    () => racersFromState(state, { myAddress: signer?.address, participants }),
    [state, signer, participants],
  )

  useEffect(() => {
    const top = racers[0]?.key
    const prev = prevTop.current
    prevTop.current = top
    if (top && prev && top !== prev) {
      setFlash(top)
      const id = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(id)
    }
  }, [racers])

  if (!state?.lotId) {
    return (
      <div style={{ textAlign: 'center', padding: '70px 20px' }}>
        <BidBlitzMark size={54} style={{ opacity: .35 }} />
        <h1
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 34,
            letterSpacing: '-.03em', textTransform: 'uppercase', margin: '20px 0 8px',
          }}
        >
          You&apos;re in
        </h1>
        <p style={{ fontSize: 17, color: '#6b6d78', margin: 0 }}>
          Waiting for the host to open the first lot.
        </p>
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 22,
            background: `${paddleColor}22`, padding: '12px 18px', borderRadius: 999,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: paddleColor }} />
          <span style={{ fontWeight: 700 }}>{entityLabel(me.entityId, state?.mode)}</span>
          <span style={{ color: '#6b6d78' }}>·</span>
          <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800 }}>
            {formatAmount(me.purse)} PTS
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ textAlign: 'center', paddingTop: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700 }}>
          LOT #{state.lotId}{sold ? ' · SOLD' : live ? ' · LIVE' : ''}
        </div>

        {state.limage && (
          <img
            src={state.limage}
            alt=""
            style={{
              width: 150, height: 150, objectFit: 'cover', borderRadius: 20, margin: '14px 0 0',
              boxShadow: '0 22px 60px rgba(30,20,70,.18)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}

        <h1
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, letterSpacing: '-.035em',
            textTransform: 'uppercase', fontSize: 'clamp(30px,5.6vw,54px)', margin: '14px 0 0',
            textWrap: 'balance', lineHeight: .96,
          }}
        >
          {state.lname}
        </h1>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700 }}>
            {sold ? 'SOLD FOR' : 'CURRENT BID'}
          </div>
          <div
            style={{
              fontFamily: "'Archivo', sans-serif", fontWeight: 900, lineHeight: 1,
              fontSize: 'clamp(48px,10vw,86px)', letterSpacing: '-.035em',
              color: live && remaining <= 5 ? '#ff4d4d' : '#6b2de6',
            }}
          >
            {formatAmount(highest)}<span style={{ fontSize: '.3em', marginLeft: 8 }}>PTS</span>
          </div>
          <div style={{ fontSize: 16, color: '#2a2a3a', marginTop: 6 }}>
            {sold && leaderName ? (
              <span style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 999, background: '#e9f9ef', color: '#12703a', fontWeight: 800 }}>
                🎉 {state.lname} sold to {leaderName}
              </span>
            ) : highest === 0n ? 'No bids yet — open it' : `${leaderName} leading`}
          </div>
        </div>
      </div>

      {racers.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700, marginBottom: 6 }}>
            WHO GETS THERE FIRST
          </div>
          <RaceTrack racers={racers} flashKey={flash} scale={0.82} unit="PTS" />
        </div>
      )}

      {isSquads(state?.mode) && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700, marginBottom: 8 }}>
            TEAM STANDINGS
          </div>
          <TeamStandings squadPurses={state?.squadPurses} leadEntity={state?.leadEntity} myEntity={me?.entityId} unit="PTS" />
        </div>
      )}
    </div>
  )
}

function Missing({ code }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <BidBlitzMark size={52} style={{ opacity: .35 }} />
        <h1
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 40,
            letterSpacing: '-.03em', textTransform: 'uppercase', margin: '18px 0 8px',
          }}
        >
          No room {code}
        </h1>
        <p style={{ color: '#6b6d78', fontSize: 17, margin: '0 0 24px' }}>
          Check the code, or host your own free auction.
        </p>
        <Link className="btn" href="/host">Host one free</Link>
      </div>
    </main>
  )
}
