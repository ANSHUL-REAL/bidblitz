'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  makePlayerId, savePlayer, loadPlayer, clearPlayer, loadHostToken, normalizeCode,
} from './freeRoom.mjs'

/**
 * Free rooms, client side.
 *
 * Deliberately mirrors useAuction/useSession so the pages, bid bar, race track
 * and big screen are shared rather than forked. /api/free/state returns the
 * same payload shape /api/state does, and FreePlayer below exposes the same
 * surface as the on-chain Signer — so nothing downstream has to know which kind
 * of room it is rendering.
 */

/**
 * Stands in for the wallet Signer. Same method names, same call shapes, but a
 * bid is a POST rather than a signed transaction: there is no key here, and
 * nothing it touches costs anybody anything.
 */
export class FreePlayer {
  constructor(code, playerId) {
    this.code = code
    this.address = playerId
    this.free = true
  }

  // The on-chain Signer needs these; a free room has no nonce and no balance.
  async syncNonce() {}
  async balance() { return 0n }

  async placeBid(_roomId, lotId, amount) {
    const res = await fetch('/api/free/bid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: this.code, playerId: this.address, lotId: Number(lotId), amount: String(amount),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `bid failed (${res.status})`)
    return null // no transaction hash — there is no transaction
  }
}

/** Polls /api/free/state. Same citizenship rules as useAuction. */
export function useFreeState({ code, live = false, intervalMs = 1000 } = {}) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  const fetchOnce = useCallback(async () => {
    if (!code) return null
    try {
      const res = await fetch(`/api/free/state?code=${code}${live ? '&live=1' : ''}`, { cache: 'no-store' })
      if (res.status === 404) {
        if (mounted.current) setError('room not found')
        return null
      }
      if (!res.ok) throw new Error(`state ${res.status}`)
      const data = await res.json()
      if (mounted.current) { setState(data); setError(null) }
      return data
    } catch (err) {
      if (mounted.current) setError(String(err.message || err))
      return null
    }
  }, [code, live])

  useEffect(() => {
    if (!code) return
    mounted.current = true
    let active = true
    let timer = null

    const loop = async () => {
      await fetchOnce()
      if (!active) return
      // Jittered, or every phone in the room synchronises on each new lot and
      // thunders the endpoint together.
      timer = setTimeout(loop, intervalMs + Math.random() * 250)
    }
    loop()

    // iOS suspends timers when the tab backgrounds; without this, anyone who
    // pockets their phone between lots comes back to a frozen screen.
    const onVisible = () => { if (document.visibilityState === 'visible') fetchOnce() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      mounted.current = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [code, intervalMs, fetchOnce])

  return { state, error, refetch: fetchOnce }
}

/** The player's own identity and purse in a free room. */
export function useFreeSession(rawCode) {
  const code = normalizeCode(rawCode)
  const [player, setPlayer] = useState(null)
  const [signer, setSigner] = useState(null)
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    if (!code) return
    const saved = loadPlayer(code)
    if (saved?.addr) {
      setPlayer(saved)
      setSigner(new FreePlayer(code, saved.addr))
    }
    setIsHost(Boolean(loadHostToken(code)))
    setReady(true)
  }, [code])

  const join = useCallback(async ({ name, avatarSeed }) => {
    setStatus('Joining…')
    try {
      // Reuse the id from a previous visit so a reload rejoins as the same
      // person rather than spawning a duplicate on the leaderboard.
      const existing = loadPlayer(code)
      const playerId = existing?.addr || makePlayerId()

      const res = await fetch('/api/free/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, playerId, name, avatarSeed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `join failed (${res.status})`)

      const next = { ...data.player, avatarSeed: data.player.avatarSeed || avatarSeed }
      savePlayer(code, next)
      setPlayer(next)
      setSigner(new FreePlayer(code, next.addr))
      setStatus('')
      return next
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [code])

  const leave = useCallback(() => {
    clearPlayer(code)
    setPlayer(null)
    setSigner(null)
  }, [code])

  /**
   * The player's purse, refreshed from whatever state poll just landed. Free
   * purses only move when a lot sells, so there is nothing to poll separately.
   */
  const syncFrom = useCallback((state) => {
    if (!state?.players || !player?.addr) return
    const mine = state.players.find((p) => p.addr === player.addr)
    if (!mine) return
    setPlayer((prev) => {
      if (prev && prev.purse === mine.purse && prev.spent === mine.spent && prev.entityId === mine.entityId) {
        return prev // same object, so React skips the re-render
      }
      return { ...prev, ...mine }
    })
  }, [player?.addr])

  return {
    code, player, signer, status, ready, isHost,
    joined: Boolean(player?.entityId),
    me: {
      entityId: player?.entityId || 0,
      purse: BigInt(player?.purse || 0),
      spent: BigInt(player?.spent || 0),
    },
    join, leave, syncFrom,
  }
}

/** Host actions. The token proves ownership; it never leaves this browser
 *  except to the API that hashes it. */
export function useFreeHost(rawCode) {
  const code = normalizeCode(rawCode)

  const call = useCallback(async (action, payload = {}) => {
    const token = loadHostToken(code)
    if (!token) throw new Error('This browser is not the host of that room.')
    const res = await fetch('/api/free/lot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, token, action, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `${action} failed (${res.status})`)
    return data
  }, [code])

  return {
    // Deliberately no `hasToken` here — reading localStorage during render makes
    // the server and client disagree on first paint. Callers check it in an
    // effect after mount instead (see the free host page).
    startLot: (name, image, seconds) => call('start', { name, image, seconds }),
    sellLot: (lotId) => call('sell', { lotId }),
    closeLot: () => call('close'),
  }
}
