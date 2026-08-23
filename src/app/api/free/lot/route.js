import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import {
  normalizeCode, isValidCode, sanitizeText, hashToken, milliToWei, DEFAULT_DURATION, MAX_DURATION,
} from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Host controls for a free room: start a lot, sell it, abandon it.
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

    if (action === 'close') {
      const { error } = await admin.rpc('free_close_lot', { p_code: code, p_token_hash: hash })
      if (error) throw error
      return Response.json({ ok: true })
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
  if (/not_host/.test(m)) return 403
  if (/no_room|no_lot/.test(m)) return 404
  if (/lot_open|room_closed/.test(m)) return 409
  return 500
}

function friendly(m) {
  if (/not_host/.test(m)) return 'Only the host of this room can do that.'
  if (/no_room/.test(m)) return 'That room no longer exists.'
  if (/no_lot/.test(m)) return 'No such lot.'
  if (/lot_open/.test(m)) return 'Finish the open lot first.'
  if (/room_closed/.test(m)) return 'This room has ended.'
  if (/bad_duration/.test(m)) return 'Pick a length between 5 and 300 seconds.'
  return 'That did not work.'
}
