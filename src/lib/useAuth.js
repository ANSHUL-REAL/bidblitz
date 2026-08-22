'use client'
import { useEffect, useState } from 'react'
import { onAuthChange, isHostEmail } from './supabase'

/**
 * Host account session. Joiners never touch this — bidding is login-free via the
 * QR/burner flow. This is only for the host to manage events, set MON
 * distribution, and see the history dashboard.
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const off = onAuthChange((u) => { setUser(u); setReady(true) })
    return off
  }, [])

  return { user, ready, isHost: isHostEmail(user?.email) }
}
