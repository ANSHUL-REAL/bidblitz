'use client'
import { useMemo } from 'react'
import { formatCrore, CRORE, squadOf, SQUADS, shortAddress } from '../lib/format.mjs'

/**
 * The race track from the BidBlitz Hero design — bidder pills with comet trails
 * and glowing spheres, leader scaled up and brighter.
 *
 * Driven by real chain data rather than the mock seed:
 *   live  -> one lane per distinct bidder on the current lot, from BidPlaced logs
 *   idle  -> one lane per squad, racing on purse, so it is never a dead grid
 *
 * Avatars are generated locally from the address instead of calling out to
 * dicebear: venue wifi should never be able to break the hero.
 */

const LIGHT = '110,84,255'   // #6E54FF
const MID = '90,61,240'
const DEEP = '36,19,143'

function Avatar({ seed, size = 42 }) {
  const { a, b, initial } = useMemo(() => {
    const s = String(seed || '0x0')
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    const hue = h % 360
    return {
      a: `hsl(${hue} 85% 78%)`,
      b: `hsl(${(hue + 42) % 360} 72% 58%)`,
      initial: /^0x/i.test(s) ? s.slice(2, 3).toUpperCase() : s.slice(0, 1).toUpperCase(),
    }
  }, [seed])

  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(160deg, ${a}, ${b})`,
        boxShadow: 'inset 0 -6px 12px rgba(0,0,0,.07)',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: size * 0.42, color: 'rgba(255,255,255,.92)',
      }}
    >
      {initial}
    </div>
  )
}

/**
 * @param racers [{ key, label, sub, amount(bigint|string), seed, color?, bids? }]
 */
export function RaceTrack({ racers, dark = false, compact = false, flashKey = null }) {
  const lanes = useMemo(() => {
    const list = racers.filter(Boolean).map((r) => ({ ...r, amount: BigInt(r.amount || 0) }))
    if (!list.length) return []

    const amounts = list.map((r) => r.amount)
    const max = amounts.reduce((m, v) => (v > m ? v : m), 0n)
    const min = amounts.reduce((m, v) => (v < m ? v : m), max)

    // Same shaping as the design: a narrow 68-96% band, so lanes stay visually
    // close and every overtake reads as dramatic even when bids differ by little.
    const lo = min > CRORE * 3n ? min - CRORE * 3n : 0n
    const hi = max + CRORE
    const span = hi - lo > 0n ? hi - lo : 1n

    return list.map((r, i) => {
      const lead = r.amount === max && max > 0n
      const progress = 68 + Number(((r.amount - lo) * 28n * 1000n) / span) / 1000
      return {
        ...r,
        lead,
        progress: Math.max(20, Math.min(96, progress)),
        indent: lead ? 0 : [26, 12, 0, 18, 8][i % 5],
        bob: [3.1, 3.6, 2.7, 3.9, 3.3][i % 5],
      }
    })
  }, [racers])

  if (!lanes.length) return null

  const scale = compact ? 0.68 : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 * scale, padding: '10px 0' }}>
      {lanes.map((r) => {
        const trailH = (r.lead ? 40 : 30) * scale
        const ball = (r.lead ? 62 : 52) * scale
        const accent = r.color || '#6e54ff'
        const deep = r.lead ? '#24138f' : '#472dd4'

        return (
          <div
            key={r.key}
            style={{
              display: 'flex', alignItems: 'center',
              transform: `scale(${r.lead ? 1.045 : 1})`,
              transition: 'transform .5s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            {/* --- bidder pill --- */}
            <div
              style={{
                flex: '0 0 auto', marginLeft: r.indent * scale, position: 'relative', zIndex: 2,
                display: 'flex', alignItems: 'center', gap: 12 * scale,
                background: dark ? '#1c1436' : '#fff',
                borderRadius: 999, padding: `${10 * scale}px ${22 * scale}px ${10 * scale}px ${10 * scale}px`,
                boxShadow: `0 ${(r.lead ? 16 : 10) * scale}px 30px rgba(${dark ? '0,0,0' : '30,20,70'},${r.lead ? 0.16 : 0.09})`,
                transition: 'box-shadow .5s ease, margin-left .8s cubic-bezier(.2,.7,.2,1)',
              }}
            >
              <Avatar seed={r.seed} size={42 * scale} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 92 * scale }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 14 * scale, fontWeight: 500,
                    color: dark ? '#fff' : 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 * scale,
                  }}
                >
                  {r.label}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13 * scale,
                    color: r.lead ? (dark ? '#fff' : '#12121c') : dark ? 'var(--ink-3)' : '#4a4a5e',
                    fontWeight: r.lead ? 700 : 500,
                    transition: 'color .4s ease',
                  }}
                >
                  {r.sub ?? formatCrore(r.amount)}
                </div>
              </div>

              {/* +BID flash */}
              <div
                style={{
                  position: 'absolute', top: -9 * scale, right: 14 * scale,
                  fontSize: 10 * scale, fontWeight: 700, letterSpacing: '.1em',
                  color: 'var(--monad-purple)', background: dark ? '#2a2050' : '#ebe6fb',
                  padding: '3px 8px', borderRadius: 999,
                  opacity: flashKey === r.key ? 1 : 0,
                  transform: `translateY(${flashKey === r.key ? 0 : 6}px)`,
                  transition: 'opacity .45s ease, transform .45s ease',
                  pointerEvents: 'none',
                }}
              >
                +BID
              </div>
            </div>

            {/* --- the trail --- */}
            <div
              style={{
                position: 'relative', flex: '1 1 auto', minWidth: 140 * scale,
                height: 52 * scale, marginLeft: -14 * scale, marginRight: 24 * scale,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)',
                  height: trailH, width: `${r.progress}%`, borderRadius: 999, filter: 'blur(.4px)',
                  background: `linear-gradient(90deg, rgba(${LIGHT},0) 0%, rgba(${LIGHT},${r.lead ? 0.3 : 0.1}) 26%, rgba(${MID},${r.lead ? 0.55 : 0.22}) 66%, rgba(${DEEP},${r.lead ? 1 : 0.62}) 100%)`,
                  transition: 'width .85s cubic-bezier(.25,.8,.25,1), height .5s ease, background .5s ease',
                }}
              />
              {/* speed lines */}
              <div
                style={{
                  position: 'absolute', top: '50%', left: '4%', transform: 'translateY(-50%)',
                  height: trailH, width: `${r.progress}%`, boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  padding: `${(r.lead ? 7 : 5) * scale}px 0`, pointerEvents: 'none',
                  transition: 'width .85s cubic-bezier(.25,.8,.25,1), height .5s ease',
                }}
              >
                {[
                  { w: '74%', h: 1, a: r.lead ? 0.6 : 0.3 },
                  { w: '92%', h: 2, a: r.lead ? 0.95 : 0.5 },
                  { w: '58%', h: 1, a: r.lead ? 0.6 : 0.3 },
                ].map((line, i) => (
                  <div
                    key={i}
                    style={{
                      height: line.h, width: line.w, alignSelf: 'flex-end', borderRadius: 999,
                      background: `linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,${line.a}))`,
                    }}
                  />
                ))}
              </div>
              {/* the sphere */}
              <div
                style={{
                  position: 'absolute', top: '50%', left: `${r.progress}%`,
                  width: ball, height: ball, marginLeft: -ball / 2, borderRadius: '50%',
                  background: `radial-gradient(circle at 32% 28%, #b3a6ff 0%, ${accent} 38%, ${deep} 100%)`,
                  boxShadow: `0 10px 26px rgba(${DEEP},${r.lead ? 0.5 : 0.22})`,
                  animation: `bb-bob ${r.bob}s ease-in-out infinite`,
                  transition: 'left .85s cubic-bezier(.25,.8,.25,1), width .5s ease, height .5s ease',
                }}
              />
            </div>

            {/* --- price --- */}
            <div style={{ flex: `0 0 ${96 * scale}px`, paddingLeft: 18 * scale }}>
              <div
                className="display"
                style={{
                  fontSize: (r.lead ? 40 : 30) * scale, letterSpacing: '-.02em', textTransform: 'none',
                  color: r.lead ? (dark ? '#fff' : '#24138f') : 'var(--monad-purple)',
                  transition: 'font-size .5s ease, color .4s ease',
                }}
              >
                {formatCrore(r.amount).replace('₹', '').replace(' Cr', '')}
              </div>
              <div
                className="display"
                style={{ fontSize: 14 * scale, fontWeight: 700, color: 'var(--monad-purple)', letterSpacing: '.04em' }}
              >
                CR
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Live bidders when a lot is running, squads racing on purse when it isn't. */
export function racersFromState(state, { myAddress } = {}) {
  const live = (state?.racers ?? []).map((r) => ({
    key: r.bidder,
    label: r.bidder?.toLowerCase() === myAddress?.toLowerCase() ? 'You' : shortAddress(r.bidder),
    sub: squadOf(r.entityId)?.short ?? `Solo`,
    amount: r.amount,
    seed: r.bidder,
    color: squadOf(r.entityId)?.color,
    bids: r.bids,
  }))
  if (live.length) return live

  return SQUADS.map((s, i) => ({
    key: `squad-${s.id}`,
    label: s.name,
    sub: 'purse',
    amount: state?.squadPurses?.[i] ?? 0n,
    seed: s.short,
    color: s.color,
  }))
}
