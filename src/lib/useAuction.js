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
export function useAuction({ roomId, live = false, intervalMs = 1000 } = {}) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const mounted = useRef(true)
  const onWake = useRef(null)

  const fetchOnce = useCallback(async () => {
    if (!roomId) return null
    try {
      const res = await fetch(`/api/state?room=${roomId}${live ? '&live=1' : ''}`, { cache: 'no-store' })
      if (res.status === 404) {
        if (mounted.current) setError('room not found')
        return null
      }
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
  }, [roomId, live])

  useEffect(() => {
    if (!roomId) return
    mounted.current = true
    // Per-run flag + timer, so a fetch in flight from a previous effect run
    // (StrictMode double-mount, or roomId/live change mid-fetch) can't schedule
    // a second poll chain that races the current one against /api/state.
    let active = true
    let id

    const loop = async () => {
      await fetchOnce()
      if (!active) return
      id = setTimeout(loop, intervalMs + Math.random() * 300)
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
      active = false
      mounted.current = false
      clearTimeout(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [fetchOnce, intervalMs, roomId])

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
/**
 * How to SHOW the value useCountdown returns.
 *
 * It returns fractions on purpose — the progress bars need them to move
 * smoothly — but a raw float renders as "265.596s", which reads like a bug.
 * Tenths only in the last ten seconds, where the drama is and where a tenth
 * genuinely changes what a bidder does; whole seconds before that.
 */
export const formatCountdown = (remaining) => {
  const r = Math.max(0, Number(remaining) || 0)
  return r < 10 ? r.toFixed(1) : String(Math.ceil(r))
}

export function useCountdown(endsAt, chainNow, fetchedAt) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!endsAt || !chainNow) {
      setRemaining(0)
      return
    }
    const end = Number(endsAt)
    const anchor = Number(chainNow)
    // Capture the CLIENT clock at anchor time. Both ends of the delta below are
    // then the same clock, so a phone/projector whose system time is skewed from
    // the server cancels out. (fetchedAt is the server clock — mixing it in here
    // would fold the skew straight into the countdown and could pin it to 0.)
    const base = Date.now()

    const tick = () => {
      const elapsed = (Date.now() - base) / 1000
      setRemaining(Math.max(0, end - anchor - elapsed))
    }

    tick()
    const id = setInterval(tick, 80)
    return () => clearInterval(id)
  }, [endsAt, chainNow, fetchedAt])

  return remaining
}
