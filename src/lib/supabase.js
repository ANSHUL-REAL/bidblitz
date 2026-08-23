'use client'
/**
 * Supabase — presentation state only (rooms' categories, item roster, avatars).
 *
 * The chain is the source of truth for money. This layer is deliberately
 * best-effort: every call swallows its errors and returns a safe empty value,
 * so a missing key or a Supabase outage degrades the UI (generic avatars, no
 * preset roster) but can never break an auction or lose a bid. See
 * supabase/schema.sql for the tables and the RLS reasoning.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// One client for the browser session. Null when unconfigured OR when the URL is
// malformed — createClient validates the URL synchronously and THROWS, so an
// unguarded call at module scope would crash every page that imports this and
// block bidding entirely. Degrade to null instead; every call site guards on it.
let _client = null
try {
  // persistSession so a host stays logged in across reloads (needed for the
  // account dashboard); autoRefreshToken keeps that session alive.
  if (URL && KEY) _client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
} catch (e) {
  if (typeof console !== 'undefined') console.warn('[supabase] disabled:', e?.message || e)
}

export const supabase = _client
export const hasSupabase = Boolean(_client)

/**
 * Anyone can host. This used to be an email allowlist gating a single featured
 * event; it is gone because the product is now "anyone hosts an auction".
 *
 * There was never any security in it anyway — the contract records the room's
 * creator address and startLot/sellLot revert for anybody else, so the wallet
 * has always been the real credential. The allowlist only hid UI, and its one
 * genuine effect was keeping strangers away from the airdrop faucet, which no
 * longer exists.
 */
export const isHostEmail = () => true

const ok = (data) => ({ data, error: null })
const fail = (error) => ({ data: null, error })

/** Create or update a room's metadata (categories, title, host). */
export async function upsertRoom({ code, roomId, mode, title, hostName, hostAddr, categories }) {
  if (!supabase || !code) return fail('no-supabase')
  try {
    const row = {
      code,
      room_id: roomId != null ? Number(roomId) : null,
      mode: Number(mode ?? 0),
      title: title ?? null,
      host_name: hostName ?? null,
      host_addr: hostAddr ?? null,
      categories: categories ?? [],
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('rooms').upsert(row, { onConflict: 'code' }).select().single()
    return error ? fail(error) : ok(data)
  } catch (e) { return fail(e) }
}

/** Read one room's metadata, or null if none / unconfigured. */
export async function getRoom(code) {
  if (!supabase || !code) return null
  try {
    const { data } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle()
    return data ?? null
  } catch { return null }
}

/** The item roster for a room, ordered. Empty array when unconfigured. */
export async function listItems(code) {
  if (!supabase || !code) return []
  try {
    const { data } = await supabase.from('room_items').select('*').eq('room_code', code).order('sort_order', { ascending: true })
    return data ?? []
  } catch { return [] }
}

/** Add one item to a room's roster. */
export async function addItem({ code, name, imageUrl, category, sortOrder }) {
  if (!supabase || !code || !name) return fail('no-supabase')
  try {
    const { data, error } = await supabase.from('room_items').insert({
      room_code: code, name, image_url: imageUrl ?? null, category: category ?? null, sort_order: sortOrder ?? 0,
    }).select().single()
    return error ? fail(error) : ok(data)
  } catch (e) { return fail(e) }
}

/** Link a roster row to its on-chain lot once it has been started. */
export async function markItemStarted(id, chainLotId) {
  if (!supabase || !id) return fail('no-supabase')
  try {
    const { error } = await supabase.from('room_items').update({ chain_lot_id: Number(chainLotId) }).eq('id', id)
    return error ? fail(error) : ok(true)
  } catch (e) { return fail(e) }
}

/** Record (or update) a participant's display name + avatar for a room. */
export async function upsertParticipant({ code, addr, name, avatarSeed, squad }) {
  if (!supabase || !code || !addr) return fail('no-supabase')
  try {
    const row = {
      room_code: code,
      addr: String(addr).toLowerCase(),
      name: name ?? null,
      avatar_seed: avatarSeed ?? null,
      squad: squad != null ? Number(squad) : null,
    }
    const { data, error } = await supabase.from('participants').upsert(row, { onConflict: 'room_code,addr' }).select().single()
    return error ? fail(error) : ok(data)
  } catch (e) { return fail(e) }
}

/** Everyone who has joined a room (for the big screen / leaderboard). */
export async function listParticipants(code) {
  if (!supabase || !code) return []
  try {
    const { data } = await supabase.from('participants').select('*').eq('room_code', code)
    return data ?? []
  } catch { return [] }
}

/**
 * Subscribe to live participant changes (avatars popping onto the big screen).
 * Returns an unsubscribe function; a no-op when unconfigured.
 */
export function onParticipants(code, cb) {
  if (!supabase || !code) return () => {}
  const ch = supabase
    .channel(`participants:${code}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_code=eq.${code}` }, cb)
    .subscribe()
  return () => { try { supabase.removeChannel(ch) } catch {} }
}

// --- Host accounts (Supabase Auth, email + password) ---------------------
export async function authSignUp(email, password) {
  if (!supabase) return { error: 'Supabase not configured' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error: error?.message || null, needsConfirm: !error && !data?.session }
}
export async function authSignIn(email, password) {
  if (!supabase) return { error: 'Supabase not configured' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error: error?.message || null }
}
export async function authSignOut() {
  if (supabase) await supabase.auth.signOut()
}
/**
 * The current session's access token, or null.
 *
 * Used to tell /api/free/* which account is joining so the room lands in a
 * saved history. Only ever the token — the server resolves the user id from it
 * itself, because a user id sent by a browser is a claim rather than proof.
 */
export async function accessToken() {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  } catch { return null }
}

export function onAuthChange(cb) {
  if (!supabase) { cb(null); return () => {} }
  supabase.auth.getUser().then(({ data }) => cb(data?.user ?? null)).catch(() => cb(null))
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null))
  return () => data?.subscription?.unsubscribe?.()
}

/** All rooms saved to Supabase, newest first — the host dashboard's source. */
export async function listRooms(limit = 60) {
  if (!supabase) return []
  try {
    const { data } = await supabase.from('rooms').select('*').order('created_at', { ascending: false }).limit(limit)
    return data ?? []
  } catch { return [] }
}

/** Participant counts per room code, for the dashboard. */
export async function participantCounts(codes) {
  if (!supabase || !codes?.length) return {}
  try {
    const { data } = await supabase.from('participants').select('room_code').in('room_code', codes)
    const out = {}
    for (const r of data ?? []) out[r.room_code] = (out[r.room_code] || 0) + 1
    return out
  } catch { return {} }
}

/** Host sets how much MON to airdrop each joiner (MON, randomised server-side). */
export async function updateRoomFunding(code, amountMon) {
  if (!supabase || !code) return fail('no-supabase')
  try {
    const { error } = await supabase.from('rooms')
      .update({ fund_amount: amountMon == null || amountMon === '' ? null : Number(amountMon) })
      .eq('code', code)
    return error ? fail(error) : ok(true)
  } catch (e) { return fail(e) }
}

/**
 * Upload a photo for a lot to Supabase Storage and return its public URL (so it
 * can be stored on-chain as a plain link every phone can load). Needs the 'lots'
 * bucket — see supabase/003_storage.sql. Returns null on any failure.
 */
export async function uploadImage(file) {
  if (!supabase || !file) return null
  try {
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const path = `${rand}.${ext}`
    const { error } = await supabase.storage.from('lots').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
    if (error) return null
    const { data } = supabase.storage.from('lots').getPublicUrl(path)
    return data?.publicUrl || null
  } catch { return null }
}
