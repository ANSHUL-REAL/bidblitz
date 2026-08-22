'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Polls /api/state. Every client in the room runs this, so it is written to be
 * a good citizen:
 *
 *  - Jittered interval. Without it all 70 phones synchronise on each new lot
 *    and thunder the endpoint together.
 *  - Refetches hard on visibilitychange. iOS suspends timers and fetches when
 *    the tab backgrounds or the screen locks, so anyone who pockets their phone
 *    between lots comes back to stale state and a wrong nonce. That is most of
 *    the room, every lot.
 *  - Never throws on a blip; keeps the last good state so the screen freezes
 *    rather than blanking.
 */
export function useAuction({ live = false, intervalMs = 1000 } = {}) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const mounted = useRef(true)
  const onWake = useRef(null)

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/state${live ? '?live=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`state ${res.status}`)
      const data = await res.json()
      if (mounted.current) {
        setState(data)
        setError(null)
      }
      return data
    } catch (err) {
      if (mounted.current) setError(String(err.message || err))
      return null
    }
  }, [live])

  useEffect(() => {
    mounted.current = true

    const loop = async () => {
      await fetchOnce()
      if (!mounted.current) return
      timer.current = setTimeout(loop, intervalMs + Math.random() * 300)
    }
    loop()

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      fetchOnce()
      onWake.current?.()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      mounted.current = false
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [fetchOnce, intervalMs])

  const setWakeHandler = useCallback((fn) => {
    onWake.current = fn
  }, [])

  return { state, error, refetch: fetchOnce, setWakeHandler }
}

/**
 * Smooth countdown.
 *
 * Deliberately NOT driven off block.timestamp: Monad's timestamp has ~1s
 * granularity (3-4 blocks share one), so a chain-driven clock freezes for a
 * second then jumps — which on a big screen reads as "the app is broken".
 * Anchor once to chain time, then interpolate locally.
 */
export function useCountdown(endsAt, chainNow, fetchedAt) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!endsAt || !chainNow) {
      setRemaining(0)
      return
    }
    const end = Number(endsAt)
    const anchor = Number(chainNow)
    const base = fetchedAt ?? Date.now()

    const tick = () => {
      // Chain time is the origin; wall-clock supplies only the elapsed delta, so
      // a projector laptop with a skewed clock still shows the right timer.
      const elapsed = (Date.now() - base) / 1000
      setRemaining(Math.max(0, end - anchor - elapsed))
    }

    tick()
    const id = setInterval(tick, 80)
    return () => clearInterval(id)
  }, [endsAt, chainNow, fetchedAt])

  return remaining
}
