'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { MonadMark } from '../../../components/Logo'
import { RaceTrack, racersFromState } from '../../../components/RaceTrack'
import { BidBar } from '../../../components/BidBar'
import { JoinCard } from '../../../components/JoinCard'
import { useAuction, useCountdown } from '../../../lib/useAuction'
import { useSession } from '../../../lib/useSession'
import { roomIdFromCode, roomCode } from '../../../lib/room.mjs'
import { formatAmount, entityLabel, squadOf } from '../../../lib/format.mjs'
import { TeamStandings } from '../../../components/TeamStandings'
import { isSquads } from '../../../lib/modes.mjs'

export default function Room({ params }) {
  const { code } = use(params)
  const roomId = roomIdFromCode(code)

  const { state, error, setWakeHandler } = useAuction({ roomId, intervalMs: 1000 })
  const session = useSession(roomId)
  const { signer, me, refreshMe, joined } = session

  useEffect(() => {
    setWakeHandler(() => {
      signer?.syncNonce?.().catch(() => {})
      refreshMe()
    })
  }, [setWakeHandler, signer, refreshMe])

  const lotId = state?.lotId
  useEffect(() => {
    refreshMe()
    signer?.syncNonce?.().catch(() => {})
  }, [lotId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!roomId) return <Missing code={code} />
  if (error === 'room not found') return <Missing code={code} />

  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#fbfbff 0%,#f1f0f9 46%,#eceaf6 100%)' }}>
      <RoomHeader state={state} code={code} session={session} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 20px 0' }}>
        {!joined ? (
          <JoinCard session={session} roomName={state?.rname} mode={state?.mode} />
        ) : (
          <LiveRoom state={state} signer={signer} me={me} />
        )}
      </div>

      {joined && <BidBar state={state} signer={signer} me={me} refreshMe={refreshMe} roomId={roomId} />}
    </main>
  )
}

function RoomHeader({ state, code, session }) {
  const isHost =
    state?.host && session.signer?.address &&
    state.host.toLowerCase() === session.signer.address.toLowerCase()

  return (
    <header
      style={{
        background: '#fff', boxShadow: '0 1px 0 rgba(18,18,28,.06)',
        position: 'sticky', top: 0, zIndex: 30,
      }}
    >
      <div
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <MonadMark size={30} />
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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6b2de6', letterSpacing: '.12em' }}>
              {code?.toUpperCase()}
            </span>
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isHost && (
            <Link
              href={`/r/${code}/host`}
              style={{
                background: '#12121c', color: '#fff', padding: '10px 16px', borderRadius: 10,
                fontWeight: 700, fontSize: 14,
              }}
            >
              Host controls
            </Link>
          )}
          <Link href={`/r/${code}/leaderboard`} style={{ fontSize: 14, fontWeight: 700, color: '#6b6d78' }}>
            Leaderboard
          </Link>
          <Link href={`/r/${code}/screen`} style={{ fontSize: 14, fontWeight: 700, color: '#6b6d78' }}>
            Big screen
          </Link>
          {session.identity && (
            <button
              className="btn-plain"
              onClick={session.leave}
              style={{
                background: '#ebe6fb', color: '#5b28d9', padding: '10px 14px',
                borderRadius: 10, fontWeight: 700, fontSize: 14,
                maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {session.identity.name}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

function LiveRoom({ state, signer, me }) {
  const remaining = useCountdown(state?.endsAt, state?.chainNow, state?.fetchedAt)
  const open = Number(state?.openLotId || 0) !== 0
  const live = open && remaining > 0
  const sold = Boolean(state?.sold) && Number(state?.lotId || 0) > 0
  const highest = BigInt(state?.highestBid || 0)
  const squad = squadOf(me.entityId)

  const [flash, setFlash] = useState(null)
  const prevTop = useRef(null)
  const racers = useMemo(
    () => racersFromState(state, { myAddress: signer?.address }),
    [state, signer],
  )

  useEffect(() => {
    const top = racers[0]?.key
    if (top && prevTop.current && top !== prevTop.current) {
      setFlash(top)
      const id = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(id)
    }
    prevTop.current = top
  }, [racers])

  if (!state?.lotId) {
    return (
      <div style={{ textAlign: 'center', padding: '70px 20px' }}>
        <MonadMark size={54} style={{ opacity: .35 }} />
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
            background: squad ? `${squad.color}22` : '#efeafd', padding: '12px 18px', borderRadius: 999,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: squad?.color || '#6b2de6' }} />
          <span style={{ fontWeight: 700 }}>{entityLabel(me.entityId)}</span>
          <span style={{ color: '#6b6d78' }}>·</span>
          <span style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800 }}>
            {formatAmount(me.purse)} MON
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
            {formatAmount(highest)}<span style={{ fontSize: '.3em', marginLeft: 8 }}>MON</span>
          </div>
          <div style={{ fontSize: 16, color: '#2a2a3a', marginTop: 6 }}>
            {highest === 0n ? 'No bids yet — open it' : `${entityLabel(state.leadEntity)} leading`}
          </div>
        </div>
      </div>

      {racers.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700, marginBottom: 6 }}>
            WHO GETS THERE FIRST
          </div>
          <RaceTrack racers={racers} flashKey={flash} scale={0.82} />
        </div>
      )}

      {isSquads(state?.mode) && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#6b6d78', fontWeight: 700, marginBottom: 8 }}>
            TEAM STANDINGS
          </div>
          <TeamStandings squadPurses={state?.squadPurses} leadEntity={state?.leadEntity} myEntity={me?.entityId} />
        </div>
      )}
    </div>
  )
}

function Missing({ code }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <MonadMark size={52} style={{ opacity: .35 }} />
        <h1
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 900, fontSize: 40,
            letterSpacing: '-.03em', textTransform: 'uppercase', margin: '18px 0 8px',
          }}
        >
          No room {code?.toUpperCase()}
        </h1>
        <p style={{ color: '#6b6d78', fontSize: 17, margin: '0 0 24px' }}>
          Check the code, or host your own auction.
        </p>
        <Link className="btn" href="/">Back to BidBlitz</Link>
      </div>
    </main>
  )
}
