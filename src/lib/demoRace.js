'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * The hero's idle animation, ported from the canvas file's Component class.
 *
 * The mockup is always in motion because it drives itself off a SEED array on a
 * 140ms interval. Real chain data only moves when someone actually bids, so
 * before a lot opens — or before the contract is even deployed — the lanes would
 * sit dead still. This keeps the hero alive until real bids take over.
 *
 * Timing is the source's: acc += 140 * speed each tick, and at 1100 a random
 * lane gains 0.02-0.07. At the default speed of 1.5 that is a bump roughly
 * every 0.7s.
 */

const SEED = [
  { addr: '0xA7..9F', bid: 12.34, indent: 26, bob: 3.1 },
  { addr: '0x91..BC', bid: 12.38, indent: 12, bob: 3.6 },
  { addr: '0x67..3H', bid: 12.42, indent: 0, bob: 2.7 },
  { addr: '0xD2..8K', bid: 12.40, indent: 18, bob: 3.9 },
]

export function useDemoRace({ enabled = true, speed = 1.5 } = {}) {
  const [bids, setBids] = useState(() => SEED.map((r) => r.bid))
  const [flashIndex, setFlashIndex] = useState(-1)
  const acc = useRef(0)
  const flashTimer = useRef(null)

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      acc.current += 140 * speed
      if (acc.current < 1100) return
      acc.current = 0

      const i = Math.floor(Math.random() * SEED.length)
      setBids((prev) => {
        const next = prev.slice()
        next[i] = Math.round((next[i] + 0.02 + Math.random() * 0.05) * 100) / 100
        return next
      })

      setFlashIndex(i)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlashIndex(-1), 900)
    }, 140)

    return () => {
      clearInterval(id)
      clearTimeout(flashTimer.current)
    }
  }, [enabled, speed])

  const racers = SEED.map((r, i) => ({
    key: r.addr,
    label: r.addr,
    // wei, so it shares one code path with real bids
    amount: BigInt(Math.round(bids[i] * 100)) * 10n ** 16n,
    seed: r.addr,
    indent: r.indent,
    bob: r.bob,
    demo: true,
  }))

  return { racers, flashKey: flashIndex >= 0 ? SEED[flashIndex].addr : null }
}
