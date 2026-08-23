'use client'
import { useCallback, useEffect, useState } from 'react'
import { readContract } from 'viem/actions'
import { BIDBLITZ_ABI } from './abi.mjs'
import {
  readClient, squadForAddress, waitForFunds, MIN_GAS_BALANCE, CONTRACT,
} from './tx.mjs'
import { InjectedSigner } from './wallet.mjs'

const SIGNED_OUT = 'bidblitz:signed-out'

/**
 * One session, one wallet: the bidder's own.
 *
 * Every participant in an on-chain room pays for their own gas and their own
 * bids. BidBlitz holds no treasury and no relayer pool, so there is nothing
 * here that can spend somebody else's MON — the previous airdrop-on-join was
 * both an open faucet and the reason burner wallets existed at all.
 *
 * Rooms that want a no-wallet, nothing-to-lose join are FREE rooms, which run
 * off-chain (see useFreeRoom) and never touch this hook.
 */
export function useSession(roomId) {
  const [signer, setSigner] = useState(null)
  const [identity, setIdentity] = useState(null)
  const [me, setMe] = useState({ entityId: 0, purse: 0n, spent: 0n })
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  // Set while the bidder's own wallet is short of gas. The UI turns this into a
  // "send MON to this address" panel; we poll until it lands.
  const [funding, setFunding] = useState(null)

  const label = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  // Silent reconnect: no popup, so a reload mid-lot doesn't cost a prompt.
  // Skipped after an explicit sign-out, or leaving would undo itself on reload.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const optedOut = (() => {
        try { return localStorage.getItem(SIGNED_OUT) === '1' } catch { return false }
      })()
      const s = optedOut ? null : await InjectedSigner.restore()
      if (alive && s) {
        setSigner(s)
        setIdentity({ name: label(s.address), address: s.address, injected: true })
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
  }, [])

  const refreshMe = useCallback(async () => {
    if (!signer || !CONTRACT || !roomId) return
    try {
      const [entityId, purse, spent] = await readContract(readClient, {
        address: CONTRACT,
        abi: BIDBLITZ_ABI,
        functionName: 'purseOf',
        args: [Number(roomId), signer.address],
      })
      setMe({ entityId: Number(entityId), purse, spent })
    } catch {}
  }, [signer, roomId])

  useEffect(() => {
    refreshMe()
    signer?.syncNonce?.().catch(() => {})
  }, [refreshMe, signer])

  const entityIdOf = useCallback(async (address) => {
    const [entityId] = await readContract(readClient, {
      address: CONTRACT,
      abi: BIDBLITZ_ABI,
      functionName: 'purseOf',
      args: [Number(roomId), address],
    })
    return Number(entityId)
  }, [roomId])

  /**
   * Gate the join on the bidder's OWN balance.
   *
   * Checked before joining rather than at the first bid on purpose: an
   * underfunded wallet's transaction is excluded at consensus silently — no
   * revert, no receipt — which on a 20-second lot reads as "the app is broken".
   */
  const ensureFunded = useCallback(async (s) => {
    const balance = await s.balance()
    if (balance >= MIN_GAS_BALANCE) return true

    setFunding({ address: s.address, need: MIN_GAS_BALANCE, balance })
    setStatus('Waiting for MON…')

    const ok = await waitForFunds(s, {
      onTick: (b) => setFunding((f) => (f ? { ...f, balance: b } : f)),
    })

    setFunding(null)
    if (!ok) throw new Error('That wallet still has no MON for gas. Top it up and try again.')
    return true
  }, [])

  const finishJoin = useCallback(async (s) => {
    if (!roomId) return
    if ((await entityIdOf(s.address)) !== 0) return // already in this room

    setStatus('Joining the auction…')
    await s.syncNonce?.()

    // Solo/meme rooms have no squads — everyone mints their own entity. Fantasy
    // rooms draft you onto one of the four teams. joinSquad reverts in a solo
    // room, so the mode has to decide.
    const snap = await readContract(readClient, {
      address: CONTRACT, abi: BIDBLITZ_ABI, functionName: 'state', args: [Number(roomId)],
    })
    if (Number(snap.mode) === 1) {
      await s.joinSquad(roomId, squadForAddress(s.address))
    } else {
      await s.joinSolo(roomId)
    }
  }, [roomId, entityIdOf])

  /** Connect MetaMask / Rabby / OKX / Backpack and join with your own MON. */
  const connectWallet = useCallback(async () => {
    setStatus('Connecting wallet…')
    try {
      const s = await InjectedSigner.connect()
      try { localStorage.removeItem(SIGNED_OUT) } catch {}
      // Show who's connected immediately — the funding panel below needs the
      // address on screen for someone to send MON to.
      setSigner(s)
      setIdentity({ name: label(s.address), address: s.address, injected: true })

      await ensureFunded(s)
      await finishJoin(s)

      setStatus('')
      setTimeout(refreshMe, 300)
      return s
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [ensureFunded, finishJoin, refreshMe])

  /** Join another room with the wallet already connected. */
  const joinRoom = useCallback(async () => {
    if (!signer) return
    setStatus('Joining the auction…')
    try {
      await ensureFunded(signer)
      await finishJoin(signer)
      setStatus('')
      setTimeout(refreshMe, 300)
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [signer, ensureFunded, finishJoin, refreshMe])

  /**
   * Drops the app's reference to the wallet. It cannot revoke the site's
   * permission — only the wallet extension can do that — so this is "sign out
   * of BidBlitz", not "disconnect MetaMask".
   */
  const leave = useCallback(() => {
    try { localStorage.setItem(SIGNED_OUT, '1') } catch {}
    setIdentity(null)
    setSigner(null)
    setFunding(null)
    setMe({ entityId: 0, purse: 0n, spent: 0n })
  }, [])

  return {
    signer, identity, me, status, ready, funding,
    joined: me.entityId !== 0,
    refreshMe, connectWallet, joinRoom, leave,
  }
}
