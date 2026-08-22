'use client'
import { useCallback, useEffect, useState } from 'react'
import { readContract } from 'viem/actions'
import { BIDBLITZ_ABI } from './abi.mjs'
import { Signer, readClient, squadForAddress, requestFunding, waitForArming, CONTRACT } from './tx.mjs'
import { roomCode } from './room.mjs'
import { InjectedSigner } from './wallet.mjs'
import { deriveAccount, loadIdentity, saveIdentity, clearIdentity } from './identity.mjs'

/**
 * One session, two possible wallets.
 *
 * The burner (name + password) is the default because it gets a stranger bidding
 * in about fifteen seconds. An injected wallet is the opt-in path for people who
 * already have one. Both expose the same interface, so every screen and the
 * contract itself are indifferent to which one signed.
 */
export function useSession(roomId) {
  const [signer, setSigner] = useState(null)
  const [identity, setIdentity] = useState(null)
  const [me, setMe] = useState({ entityId: 0, purse: 0n, spent: 0n })
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = loadIdentity()
    if (saved?.key) {
      setIdentity(saved)
      setSigner(new Signer(saved.key))
    }
    setReady(true)
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

  /** Fund if needed, then wait out Monad's lagged reserve-balance window. */
  const fundAndArm = useCallback(async (s) => {
    if ((await s.balance()) > 0n) return

    const rc = roomId ? roomCode(roomId) : null  // lets the relayer use the host-set amount
    setStatus('Funding your wallet…')
    const fund = await requestFunding(s.address, false, rc)

    const deadline = Date.now() + 20000
    let funded = false
    while (Date.now() < deadline) {
      if ((await s.balance()) > 0n) { funded = true; break }
      await new Promise((r) => setTimeout(r, 400))
    }
    if (!funded) {
      await requestFunding(s.address, true, rc) // force: break a stale lock
      await new Promise((r) => setTimeout(r, 2500))
    }

    // A wallet funded at block B had zero balance at B-3, and Monad derives the
    // inflight gas budget from that lagged state — so its first bid would be
    // excluded at consensus, silently, with no receipt and no revert.
    setStatus('Arming your wallet…')
    await waitForArming(await readClient.getBlockNumber(), fund?.armBlocks ?? 4)
  }, [roomId])

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

  /** Burner path: name + password derive the wallet, on any device. */
  const joinWithPassword = useCallback(async (name, password) => {
    setStatus('Deriving your wallet…')
    const { key, account } = deriveAccount(name, password)
    const s = new Signer(key)

    try {
      // Knowing the password IS the proof of identity, so an existing entity
      // just means this person is coming back. Skip funding entirely.
      const existing = roomId ? await entityIdOf(account.address) : 0
      if (existing === 0) {
        await fundAndArm(s)
        await finishJoin(s)
      }

      const ident = { name, key, address: account.address }
      saveIdentity(ident)
      setIdentity(ident)
      setSigner(s)
      setStatus('')
      setTimeout(refreshMe, 300)
      return s
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [roomId, entityIdOf, fundAndArm, finishJoin, refreshMe])

  /** Bring-your-own-wallet path: MetaMask, Rabby, OKX, Backpack. */
  const connectWallet = useCallback(async () => {
    setStatus('Connecting wallet…')
    try {
      const s = await InjectedSigner.connect()
      await fundAndArm(s)
      await finishJoin(s)

      const ident = { name: `${s.address.slice(0, 6)}…${s.address.slice(-4)}`, address: s.address, injected: true }
      setIdentity(ident)
      setSigner(s)
      setStatus('')
      setTimeout(refreshMe, 300)
      return s
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [fundAndArm, finishJoin, refreshMe])

  /** Join a different room with the wallet already in hand. */
  const joinRoom = useCallback(async () => {
    if (!signer) return
    setStatus('Joining the auction…')
    try {
      await fundAndArm(signer)
      await finishJoin(signer)
      setStatus('')
      setTimeout(refreshMe, 300)
    } catch (err) {
      setStatus('')
      throw err
    }
  }, [signer, fundAndArm, finishJoin, refreshMe])

  const leave = useCallback(() => {
    clearIdentity()
    setIdentity(null)
    setSigner(null)
    setMe({ entityId: 0, purse: 0n, spent: 0n })
  }, [])

  return {
    signer, identity, me, status, ready,
    joined: me.entityId !== 0,
    refreshMe, joinWithPassword, connectWallet, joinRoom, leave,
  }
}
