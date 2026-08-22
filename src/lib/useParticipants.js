'use client'
import { useEffect, useMemo, useState } from 'react'
import { listParticipants, onParticipants } from './supabase'
import { roomCode, roomIdFromCode } from './room.mjs'

/**
 * Live map of a room's participants, keyed by lowercased wallet address:
 *   addr -> { name, avatar_seed, squad }
 *
 * Fetches once, then subscribes to realtime inserts/updates so a face and name
 * pop onto the big screen the instant someone joins. Empty map when Supabase is
 * not configured — callers fall back to the address-derived avatar.
 */
export function useParticipants(code) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!code) return
    // Canonicalise to match how rows are written (roomCode: uppercased,
    // zero-padded), so a lowercase/unpadded URL still finds the participants.
    const rc = roomCode(roomIdFromCode(code))
    let alive = true
    const load = () => listParticipants(rc).then((r) => { if (alive) setRows(r) })
    load()
    // Realtime is the fast path, but it only fires if the table is in the
    // supabase_realtime publication (off by default). A slow poll guarantees new
    // faces appear either way — participants change rarely, so this is cheap.
    const off = onParticipants(rc, load)
    const id = setInterval(load, 5000)
    return () => { alive = false; off(); clearInterval(id) }
  }, [code])

  return useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(String(r.addr).toLowerCase(), r)
    return m
  }, [rows])
}
