import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import {
  normalizeCode, isValidCode, isPlayerId, sanitizeText, hashToken, milliToWei,
  DEFAULT_DURATION, MAX_DURATION,
} from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Host controls for a free room: start a lot, sell it, abandon it, remove a
 * player, end the room.
 *
 * Authorised by the host token the browser generated at creation. Only its hash
 * was ever stored, and the token is hashed here on the server, so the check is
 * a hash comparison inside the database function — the same place that mutates
 * the row, which is what makes it worth anything.
 *
 * This is genuinely weaker than the on-chain rooms, where the host is a wallet
 * the contract itself enforces. The trade is deliberate: demanding a wallet to
 * host a free room would defeat the point of a free room. Losing one is losing
 * a party game, not money.
 */
export async function POST(request) {
  if (!admin) return notConfigured()

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  const code = normalizeCode(body?.code)
  const token = String(body?.token || '')
  const action = String(body?.action || '')

  if (!isValidCode(code)) return Response.json({ error: 'code required' }, { status: 400 })
  if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ error: 'not the host' }, { status: 403 })

  const hash = await hashToken(token)

  try {
    if (action === 'start') {
      const name = sanitizeText(body?.name, 60)
      if (!name) return Response.json({ error: 'Name required' }, { status: 400 })
      const seconds = clampDuration(body?.seconds)

      const { data, error } = await admin.rpc('free_start_lot', {
        p_code: code, p_token_hash: hash,
        p_name: name, p_image: String(body?.image || '').slice(0, 500), p_seconds: seconds,
      })
      if (error) throw error
      const lot = Array.isArray(data) ? data[0] : data
      return Response.json({ ok: true, lot: shapeLot(lot) })
    }

    if (action === 'sell') {
      const lotId = Number(body?.lotId)
      if (!Number.isInteger(lotId) || lotId <= 0) {
        return Response.json({ error: 'bad lot' }, { status: 400 })
      }
      const { data, error } = await admin.rpc('free_sell_lot', {
        p_code: code, p_token_hash: hash, p_lot: lotId,
      })
      if (error) throw error
      const lot = Array.isArray(data) ? data[0] : data
      return Response.json({ ok: true, lot: shapeLot(lot) })
    }

    // Queue management — the host's prepared catalogue.
    if (action === 'addItem') {
      const name = sanitizeText(body?.name, 60)
      if (!name) return Response.json({ error: 'Name required' }, { status: 400 })
      const { data, error } = await admin.rpc('free_add_item', {
        p_code: code, p_token_hash: hash,
        p_name: name, p_image: String(body?.image || '').slice(0, 500),
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return Response.json({ ok: true, item: shapeItem(row) })
    }

    if (action === 'removeItem') {
      const { error } = await admin.rpc('free_remove_item', {
        p_code: code, p_token_hash: hash, p_item: String(body?.itemId || ''),
      })
      if (error) throw error
      return Response.json({ ok: true })
    }

    // Continue: take the next queued item and open it. One RPC so two taps
    // cannot grab the same item or open two lots.
    if (action === 'startNext') {
      const { data, error } = await admin.rpc('free_start_next', {
        p_code: code, p_token_hash: hash, p_seconds: clampDuration(body?.seconds),
      })
      if (error) throw error
      const lot = Array.isArray(data) ? data[0] : data
      return Response.json({ ok: true, lot: shapeLot(lot) })
    }

    if (action === 'close') {
      const { error } = await admin.rpc('free_close_lot', { p_code: code, p_token_hash: hash })
      if (error) throw error
      return Response.json({ ok: true })
    }

    // Ending a room deliberately does NOT sell whatever is live. Stopping an
    // auction must never charge whoever happened to be leading at the time.
    if (action === 'end') {
      const { error } = await admin.rpc('free_end_room', { p_code: code, p_token_hash: hash })
      if (error) throw error
      return Response.json({ ok: true, closed: true })
    }

    if (action === 'kick') {
      const player = String(body?.playerId || '').toLowerCase()
      if (!isPlayerId(player)) return Response.json({ error: 'bad player id' }, { status: 400 })
      const { error } = await admin.rpc('free_kick_player', {
        p_code: code, p_token_hash: hash, p_player: player,
      })
      if (error) throw error
      return Response.json({ ok: true, removed: player })
    }

    return Response.json({ error: 'unknown action' }, { status: 400 })
  } catch (error) {
    const m = String(error?.message || error)
    return Response.json({ error: friendly(m) }, { status: statusFor(m) })
  }
}

const clampDuration = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_DURATION
  return Math.min(MAX_DURATION, Math.max(5, Math.round(n)))
}

const shapeItem = (i) =>
  i && { id: i.id, name: i.name, image: i.image_url, order: i.sort_order, lotId: i.lot_id }

const shapeLot = (l) =>
  l && {
    lotId: l.lot_id,
    name: l.name,
    image: l.image_url,
    endsAt: Math.floor(new Date(l.ends_at).getTime() / 1000),
    highestBid: milliToWei(l.high_bid),
    leader: l.high_player,
    sold: l.sold,
  }

function statusFor(m) {
  if (/PGRST202|Could not find the function/i.test(m)) return 503
  if (/not_host/.test(m)) return 403
  if (/no_room|no_lot|no_player/.test(m)) return 404
  if (/lot_open|room_closed|queue_empty/.test(m)) return 409
  if (/bad_name/.test(m)) return 400
  return 500
}

function friendly(m) {
  // A function the database has never heard of means a migration was not
  // applied. Say so, rather than 'that did not work'.
  if (/PGRST202|Could not find the function/i.test(m)) {
    return 'This needs migration 008 applied in Supabase (the item queue).'
  }
  if (/not_host/.test(m)) return 'Only the host of this room can do that.'
  if (/no_room/.test(m)) return 'That room no longer exists.'
  if (/no_lot/.test(m)) return 'No such lot.'
  if (/no_player/.test(m)) return 'That player is not in this room.'
  if (/lot_open/.test(m)) return 'Finish the open lot first.'
  if (/queue_empty/.test(m)) return 'Nothing left in the queue — add an item.'
  if (/bad_name/.test(m)) return 'Give the item a name.'
  if (/room_closed/.test(m)) return 'This room has ended.'
  if (/bad_duration/.test(m)) return 'Pick a length between 5 and 300 seconds.'
  return 'That did not work.'
}
