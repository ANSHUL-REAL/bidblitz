'use client'
import { useMemo, useLayoutEffect, useRef } from 'react'
import { formatAmount, squadOf, SQUADS, shortAddress } from '../lib/format.mjs'
import { Avatar } from './Avatar'

/**
 * Direct transcription of the race track from the BidBlitz Hero canvas.
 * Every dimension, colour stop, easing curve and lead/trail value below is the
 * source file's, not an approximation:
 *
 *   lead   scale 1.045 · indent 0  · shadow 16/.16 · trail 40 · ball 62 · price 40
 *   trail  scale 1     · indent r  · shadow 10/.09 · trail 30 · ball 52 · price 30
 *
 * The only substantive change is the data: lanes come from real BidPlaced logs
 * rather than the SEED array, falling back to squads racing on purse between
 * lots so the hero is never a dead grid.
 */

const SEED_META = [
  { indent: 26, bob: 3.1 },
  { indent: 12, bob: 3.6 },
  { indent: 0, bob: 2.7 },
  { indent: 18, bob: 3.9 },
  { indent: 8, bob: 3.3 },
]

export function RaceTrack({ racers, dark = false, flashKey = null, scale = 1 }) {
  const lanes = useMemo(() => {
    const list = racers.filter(Boolean).map((r) => ({ ...r, amount: BigInt(r.amount || 0) }))
    if (!list.length) return []

    const nums = list.map((r) => Number(r.amount) / 1e18)
    const max = Math.max(...nums)
    const min = Math.min(...nums)
    // Only a UNIQUE max leads. Squads all start on equal purses, so without this
    // every lane renders as the leader between lots.
    const hasLeader = max > 0 && nums.filter((n) => n === max).length === 1

    // Source shaping: lo = min - .03, hi = max + .012, progress = 68 + t*28.
    // Scaled to our units so lanes still sit in a tight 68-96% band, which is
    // what makes an overtake read as dramatic even on a small bid difference.
    const lo = min - Math.max(0.03, (max - min) * 0.35 + 0.03)
    const hi = max + Math.max(0.012, (max - min) * 0.04)
    const span = hi - lo || 1

    return list.map((r, i) => {
      const v = Number(r.amount) / 1e18
      const lead = hasLeader && v === max
      return {
        ...r,
        lead,
        progress: (68 + ((v - lo) / span) * 28).toFixed(2),
        indent: r.indent ?? SEED_META[i % SEED_META.length].indent,
        bob: r.bob ?? SEED_META[i % SEED_META.length].bob,
      }
    })
  }, [racers])

  const containerRef = useRef(null)
  const prevTops = useRef(new Map())

  // FLIP the lanes so an overtake slides past instead of snapping. Measured by
  // offsetTop (layout position, transform-independent) so the frequent hero/demo
  // re-renders don't restart a slide in progress. The base scale rides in a
  // --s custom property, so the slide transform never clobbers the leader's grow.
  useLayoutEffect(() => {
    const c = containerRef.current
    if (!c) return
    const seen = new Set()
    for (const node of c.children) {
      const key = node.dataset.key
      if (!key) continue
      seen.add(key)
      const top = node.offsetTop
      const old = prevTops.current.get(key)
      if (old != null && Math.abs(old - top) > 1) {
        const dy = old - top
        node.style.transition = 'none'
        node.style.transform = `translateY(${dy}px) scale(var(--s))`
        node.getBoundingClientRect() // reflow
        requestAnimationFrame(() => {
          node.style.transition = 'transform .6s cubic-bezier(.2,.85,.25,1)'
          node.style.transform = 'scale(var(--s))'
        })
      }
      prevTops.current.set(key, top)
    }
    for (const k of [...prevTops.current.keys()]) if (!seen.has(k)) prevTops.current.delete(k)
  })

  if (!lanes.length) return null

  const s = scale

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 30 * s, padding: '10px 0' }}>
      {lanes.map((r, i) => {
        const trailH = (r.lead ? 40 : 30) * s
        const ball = (r.lead ? 62 : 52) * s
        const ballHalf = ball / 2
        const trailA0 = r.lead ? 0.3 : 0.1
        const trailA1 = r.lead ? 0.55 : 0.22
        const trailA2 = r.lead ? 1 : 0.62
        const lineA = r.lead ? 0.6 : 0.3
        const lineB = r.lead ? 0.95 : 0.5
        const flashOn = flashKey === r.key

        return (
          <div
            key={r.key}
            data-key={r.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 0,
              '--s': r.lead ? 1.045 : 1,
              transform: 'scale(var(--s))',
              transition: 'transform .5s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            {/* ---- pill ---- */}
            <div
              style={{
                flex: '0 0 auto',
                marginLeft: (r.lead ? 0 : r.indent) * s,
                display: 'flex', alignItems: 'center', gap: 12 * s,
                background: dark ? '#1c1436' : '#fff',
                borderRadius: 999,
                padding: `${10 * s}px ${22 * s}px ${10 * s}px ${10 * s}px`,
                boxShadow: `0 ${(r.lead ? 16 : 10) * s}px 30px rgba(${dark ? '0,0,0' : '30,20,70'},${r.lead ? 0.16 : 0.09})`,
                position: 'relative', zIndex: 2,
                transition: 'box-shadow .5s ease, margin-left .8s cubic-bezier(.2,.7,.2,1)',
              }}
            >
              <Avatar seed={r.seed} size={42 * s} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 92 * s }}>
                <div
                  style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 14 * s, fontWeight: 500,
                    color: dark ? '#fff' : '#12121c', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 * s,
                  }}
                >
                  {r.label}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 13 * s,
                    color: r.lead ? (dark ? '#fff' : '#12121c') : dark ? '#8d85b4' : '#4a4a5e',
                    fontWeight: r.lead ? 700 : 500,
                    transition: 'color .4s ease',
                  }}
                >
                  {formatAmount(r.amount)} MON
                </div>
              </div>

              <div
                style={{
                  position: 'absolute', top: -9 * s, right: 14 * s,
                  fontSize: 10 * s, fontWeight: 700, letterSpacing: '.1em',
                  color: '#6b2de6', background: dark ? '#2a2050' : '#ebe6fb',
                  padding: '3px 8px', borderRadius: 999,
                  opacity: flashOn ? 1 : 0,
                  transform: `translateY(${flashOn ? 0 : 6}px)`,
                  transition: 'opacity .45s ease, transform .45s ease',
                  pointerEvents: 'none',
                }}
              >
                +BID
              </div>
            </div>

            {/* ---- track ---- */}
            <div
              style={{
                position: 'relative', flex: '1 1 auto', minWidth: 140 * s,
                height: 52 * s, marginLeft: -14 * s, marginRight: 24 * s,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: '50%', left: 0,
                  height: trailH, width: `${r.progress}%`, transform: 'translateY(-50%)',
                  borderRadius: '999px 999px 999px 999px',
                  background: `linear-gradient(90deg, rgba(124,61,237,0) 0%, rgba(124,61,237,${trailA0}) 26%, rgba(107,45,230,${trailA1}) 66%, rgba(78,20,200,${trailA2}) 100%)`,
                  filter: 'blur(.4px)',
                  transition: 'width .85s cubic-bezier(.25,.8,.25,1), height .5s ease, background .5s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute', top: '50%', left: '4%',
                  height: trailH, width: `${r.progress}%`, transform: 'translateY(-50%)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  padding: `${(r.lead ? 7 : 5) * s}px 0`, boxSizing: 'border-box', pointerEvents: 'none',
                  transition: 'width .85s cubic-bezier(.25,.8,.25,1), height .5s ease',
                }}
              >
                <div style={{ height: 1, width: '74%', alignSelf: 'flex-end', background: `linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,${lineA}))`, borderRadius: 999 }} />
                <div style={{ height: 2, width: '92%', alignSelf: 'flex-end', background: `linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,${lineB}))`, borderRadius: 999 }} />
                <div style={{ height: 1, width: '58%', alignSelf: 'flex-end', background: `linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,${lineA}))`, borderRadius: 999 }} />
              </div>
              <div
                style={{
                  position: 'absolute', top: '50%', left: `${r.progress}%`,
                  width: ball, height: ball, marginLeft: -ballHalf, borderRadius: '50%',
                  background: `radial-gradient(circle at 32% 28%, #a983ff 0%, #7c3ded 38%, ${r.lead ? '#3c0fa8' : '#5a20cf'} 100%)`,
                  boxShadow: `0 10px 26px rgba(84,26,214,${r.lead ? 0.5 : 0.22})`,
                  animation: `om-bob ${r.bob}s ease-in-out infinite`,
                  transition: 'left .85s cubic-bezier(.25,.8,.25,1), width .5s ease, height .5s ease',
                }}
              />
            </div>

            {/* ---- price ---- */}
            <div style={{ flex: `0 0 ${96 * s}px`, textAlign: 'left', paddingLeft: 18 * s }}>
              <div
                style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 800,
                  fontSize: (r.lead ? 40 : 30) * s, letterSpacing: '-.02em',
                  color: r.lead ? (dark ? '#fff' : '#3c0fa8') : '#6b2de6',
                  transition: 'font-size .5s ease, color .4s ease',
                }}
              >
                {formatAmount(r.amount)}
              </div>
              <div
                style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 14 * s,
                  color: '#6b2de6', letterSpacing: '.04em',
                }}
              >
                MON
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Live bidders while a lot runs; squads racing on purse between lots. */
export function racersFromState(state, { myAddress, participants } = {}) {
  const live = (state?.racers ?? []).map((r) => {
    // A joiner who picked a name/avatar (stored in Supabase) shows that instead
    // of a shortened 0x… address and an address-derived face.
    const p = participants?.get?.(r.bidder?.toLowerCase())
    const mine = r.bidder?.toLowerCase() === myAddress?.toLowerCase()
    return {
      key: r.bidder,
      label: mine ? 'You' : (p?.name || shortAddress(r.bidder)),
      amount: r.amount,
      seed: p?.avatar_seed || r.bidder,
      entityId: r.entityId,
    }
  })
  if (live.length) return live

  return SQUADS.map((sq, i) => ({
    key: `squad-${sq.id}`,
    label: sq.short,
    amount: state?.squadPurses?.[i] ?? 0n,
    seed: sq.short,
    entityId: sq.id,
  }))
}
