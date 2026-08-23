'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  makePlayerId, makePlayerSecret, hashToken, savePlayer, loadPlayer, clearPlayer,
  loadHostToken, normalizeCode,
} from './freeRoom.mjs'
import { accessToken } from './supabase'

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
  constructor(code, playerId, secret = null) {
    this.code = code
    this.address = playerId
    this.secret = secret
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
        code: this.code, playerId: this.address, lotId: Number(lotId),
        amount: String(amount), secret: this.secret,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `bid failed (${res.status})`)
    return null // no transaction hash — there is no transaction
  }
}

/** Polls /api/free/state. Same citizenship rules as useAuction. */
export function useFreeState({ code, live = false, full = false, intervalMs = 1000 } = {}) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  const fetchOnce = useCallback(async () => {
    if (!code) return null
    try {
      const res = await fetch(
        `/api/free/state?code=${code}${live ? '&live=1' : ''}${full ? '&full=1' : ''}`,
        { cache: 'no-store' },
      )
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
  }, [code, live, full])

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
      setSigner(new FreePlayer(code, saved.addr, saved.secret))
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
      // Reuse the secret from a previous visit, or the server would refuse the
      // bids of someone who simply reloaded the page.
      const secret = existing?.secret || makePlayerSecret()

      // Sent only if they happen to be logged in. Joining never requires it —
      // it decides whether this room is remembered, nothing else.
      const token = await accessToken()
      const res = await fetch('/api/free/join', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code, playerId, name, avatarSeed, secretHash: await hashToken(secret) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `join failed (${res.status})`)

      // The secret never leaves this browser except as a hash.
      const next = { ...data.player, secret, avatarSeed: data.player.avatarSeed || avatarSeed, saved: Boolean(data.saved) }
      savePlayer(code, next)
      setPlayer(next)
      setSigner(new FreePlayer(code, next.addr, secret))
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

  /**
   * Apply a credited points pack immediately instead of waiting up to a second
   * for the next state poll. Somebody who just spent real MON should see the
   * purse move the instant it lands, not after a beat that reads as a failure.
   * The poll then confirms it from the server anyway.
   */
  const applyCredit = useCallback((credited) => {
    if (!credited?.purse) return
    setPlayer((prev) => (prev ? { ...prev, purse: credited.purse, bought: credited.bought } : prev))
  }, [])

  return {
    code, player, signer, status, ready, isHost, applyCredit,
    joined: Boolean(player?.entityId),
    me: {
      entityId: player?.entityId || 0,
      purse: BigInt(player?.purse || 0),
      spent: BigInt(player?.spent || 0),
    },
    join, leave, syncFrom,
  }
}

/**
 * Makes the host's bots bid, from the host's own console.
 *
 * Driven client-side on purpose: it needs no background worker, and a bot that
 * only plays while the host is watching is the honest behaviour anyway — they
 * are the host's props, not independent players. Closing the console stops
 * them, which is exactly what a host would expect.
 *
 * Only ever runs when the host has switched bots ON.
 */
export function useBots({ code, state, token, enabled }) {
  const busy = useRef(false)

  useEffect(() => {
    if (!enabled || !code || !token) return
    let alive = true

    const tick = async () => {
      if (!alive || busy.current) return
      const open = Number(state?.openLotId || 0) !== 0
      const endsAt = Number(state?.endsAt || 0)
      const now = Number(state?.chainNow || 0)
      if (!open || endsAt <= now) return

      const bots = (state?.players || []).filter((p) => p.bot)
      if (!bots.length) return

      const high = BigInt(state?.highestBid || 0)
      const cap = BigInt(state?.maxBid || 0)
      // Step in whole points so the ledger stays readable on a projector.
      const step = 10n ** 18n
      const next = high + step
      if (cap > 0n && next > cap) return

      // Never outbid themselves, and never spend past their purse.
      const able = bots.filter(
        (b) => b.addr !== state?.bidder && BigInt(b.purse) >= next,
      )
      if (!able.length) return

      // Hang back at the start and get keener as the clock runs down, so a lot
      // does not open with an instant robotic bid.
      const left = endsAt - now
      const urgency = left <= 5 ? 0.9 : left <= 12 ? 0.5 : 0.22
      if (Math.random() > urgency) return

      const bot = able[Math.floor(Math.random() * able.length)]
      busy.current = true
      try {
        await fetch('/api/free/bid', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // The host token is the bots' credential — see free_add_bots.
          body: JSON.stringify({
            code, playerId: bot.addr, lotId: Number(state.lotId),
            amount: String(next), secret: token,
          }),
        })
      } catch {
        // A refused bot bid is not worth surfacing: the host is mid-auction and
        // the next tick will try again.
      } finally {
        busy.current = false
      }
    }

    const id = setInterval(tick, 1400)
    return () => { alive = false; clearInterval(id) }
  }, [code, token, enabled, state])
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
    // The prepared catalogue: build it before the room starts, then run it.
    addItem: (name, image) => call('addItem', { name, image }),
    removeItem: (itemId) => call('removeItem', { itemId }),
    startNext: (seconds) => call('startNext', { seconds }),
    sellLot: (lotId) => call('sell', { lotId }),
    closeLot: () => call('close'),
    // Ends the session. Does NOT sell whatever is live — stopping an auction
    // must never charge whoever happened to be leading at that moment.
    endRoom: () => call('end'),
    addBots: (count) => call('addBots', { count }),
    clearBots: () => call('clearBots'),
    kickPlayer: (playerId) => call('kick', { playerId }),
  }
}
