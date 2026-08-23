import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { bump } from '../../../../lib/redis.mjs'
import {
  normalizeCode, isValidCode, isPlayerId, weiToMilli, milliToWei, hashToken,
} from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One bid in a free room.
 *
 * Every rule is enforced in the database, not here: free_place_bid decides the
 * winner of a race with a single conditional UPDATE, so two phones tapping in
 * the same millisecond cannot both come away leading. This route's only jobs
 * are to validate shapes and to keep one bored person from writing a million
 * rows — a free bid costs nothing, which is exactly why it needs a rate limit
 * that a gas fee would otherwise provide for free.
 */
const MAX_BIDS_PER_MINUTE = 120

export async function POST(request) {
  if (!admin) return notConfigured()

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  const code = normalizeCode(body?.code)
  const playerId = String(body?.playerId || '').toLowerCase()
  const lotId = Number(body?.lotId)

  if (!isValidCode(code)) return Response.json({ error: 'code required' }, { status: 400 })
  if (!isPlayerId(playerId)) return Response.json({ error: 'bad player id' }, { status: 400 })
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return Response.json({ error: 'bad lot' }, { status: 400 })
  }

  // Amounts arrive as 18-decimal wei strings so the bidding UI is identical to
  // an on-chain room's; the store works in milli-units.
  let milli
  try {
    milli = weiToMilli(BigInt(body?.amount ?? '0'))
  } catch {
    return Response.json({ error: 'bad amount' }, { status: 400 })
  }
  if (milli <= 0n || milli > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Response.json({ error: 'bad amount' }, { status: 400 })
  }

  if ((await bump(`free:bid:${code}:${playerId}`, 60)) > MAX_BIDS_PER_MINUTE) {
    return Response.json({ error: 'Easy — too many bids.' }, { status: 429 })
  }

  // Proof of WHO is bidding. The player id cannot serve as this: it is
  // published in every state payload so the leaderboard can render.
  const secret = /^[0-9a-f]{64}$/.test(String(body?.secret || ''))
    ? await hashToken(String(body.secret))
    : null

  const { data, error } = await admin.rpc('free_place_bid', {
    p_code: code,
    p_player: playerId,
    p_lot: lotId,
    p_amount: Number(milli),
    p_secret: secret,
  })

  if (error) return Response.json({ error: friendly(error.message) }, { status: statusFor(error.message) })

  return Response.json({
    ok: true,
    lotId: data?.lotId,
    highestBid: milliToWei(data?.highBid ?? 0),
    leader: data?.leader ?? null,
  })
}

function statusFor(m) {
  if (/not_joined|kicked|bad_secret/.test(m)) return 403
  if (/room_closed/.test(m)) return 409
  if (/bid_rejected|exceeds_purse|bad_amount|over_cap/.test(m)) return 409
  return 500
}

function friendly(m) {
  if (/not_joined/.test(m)) return 'Join the room before bidding.'
  if (/kicked/.test(m)) return 'The host removed you from this room.'
  if (/bad_secret/.test(m)) return 'That is not your paddle — rejoin the room.'
  if (/room_closed/.test(m)) return 'This auction has ended.'
  if (/exceeds_purse/.test(m)) return 'Not enough purse left.'
  // The pay-to-win cap. Buying points lets you contest more lots, never
  // outbid someone infinitely on one.
  if (/over_cap/.test(m)) return "That is over this room's max bid."
  // The one people actually hit: outbid between the poll and the tap, or the
  // clock ran out. Both read the same on stage — you were too slow.
  if (/bid_rejected/.test(m)) return 'Too slow — outbid or the lot closed.'
  return 'Bid failed.'
}
