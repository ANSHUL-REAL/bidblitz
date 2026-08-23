import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { publicClient } from '../../../../lib/server.mjs'
import { bump } from '../../../../lib/redis.mjs'
import {
  normalizeCode, isValidCode, isPlayerId, milliToWei, MILLI,
} from '../../../../lib/freeRoom.mjs'
import {
  TREASURY, hasTreasury, packForWei, topupMemo, TOPUP_CONFIRMATIONS,
} from '../../../../lib/topups.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Credit a points pack after verifying the buyer really paid for it.
 *
 * The client sends a transaction hash. That is a claim, not proof, and it is
 * attacker-controlled — anyone can post any hash, including someone else's. So
 * nothing here trusts the request beyond using it to look the transaction up;
 * every fact that decides the credit is read from the chain:
 *
 *   1. mined, and status === 'success'          (not pending, not reverted)
 *   2. `to` is the treasury                     (not some other address)
 *   3. `value` matches a pack EXACTLY           (no partial or inflated credit)
 *   4. calldata === memo(room, player)          (binds it to THIS player)
 *   5. buried under a few confirmations         (no reorg reversing the payment)
 *   6. the hash has never been credited         (enforced by a PK, in the DB)
 *
 * (4) is the one that is easy to leave out and expensive to miss. Without it
 * the server only knows "somebody paid the treasury", and the first person to
 * post the hash — trivially watched for on a public chain — takes the points.
 */
const MAX_CLAIMS_PER_MINUTE = 20

export async function POST(request) {
  if (!admin) return notConfigured()
  if (!hasTreasury) {
    return Response.json(
      { error: 'Point packs are not set up — NEXT_PUBLIC_TREASURY_ADDRESS is missing.' },
      { status: 503 },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  const code = normalizeCode(body?.code)
  const playerId = String(body?.playerId || '').toLowerCase()
  const txHash = String(body?.txHash || '').toLowerCase()

  if (!isValidCode(code)) return Response.json({ error: 'code required' }, { status: 400 })
  if (!isPlayerId(playerId)) return Response.json({ error: 'bad player id' }, { status: 400 })
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    return Response.json({ error: 'bad transaction hash' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if ((await bump(`free:topup:${ip}`, 60)) > MAX_CLAIMS_PER_MINUTE) {
    return Response.json({ error: 'Slow down a moment.' }, { status: 429 })
  }

  // Packs exist only in free rooms. A MON room awards real escrowed MON, and
  // selling bidding power toward that is a different thing entirely from
  // selling it toward a leaderboard — so the room must exist HERE, in the
  // free tables, before a single point is credited.
  const { data: room } = await admin
    .from('free_rooms').select('code, closed').eq('code', code).maybeSingle()
  if (!room) return Response.json({ error: 'room not found' }, { status: 404 })
  if (room.closed) return Response.json({ error: 'This room has ended.' }, { status: 409 })

  let tx, receipt
  try {
    ;[tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: txHash }),
      publicClient.getTransactionReceipt({ hash: txHash }),
    ])
  } catch {
    // Not mined yet (or an RPC blip). Tell the client to try again rather than
    // failing the purchase — the money may well have left their wallet.
    return Response.json({ error: 'pending', retry: true }, { status: 202 })
  }

  if (!receipt || receipt.status !== 'success') {
    return Response.json({ error: 'That transaction did not succeed.' }, { status: 409 })
  }
  if (String(tx.to || '').toLowerCase() !== TREASURY.toLowerCase()) {
    return Response.json({ error: 'That payment did not go to BidBlitz.' }, { status: 409 })
  }

  const pack = packForWei(tx.value)
  if (!pack) {
    return Response.json({ error: 'That amount does not match a pack.' }, { status: 409 })
  }

  if (String(tx.input || '0x').toLowerCase() !== topupMemo(code, playerId).toLowerCase()) {
    return Response.json({ error: 'That payment belongs to a different player.' }, { status: 403 })
  }

  // Reorg guard. Cheap on a 600ms-finality chain, and the alternative is
  // crediting points for a payment that later un-happens.
  try {
    const head = await publicClient.getBlockNumber()
    if (head - receipt.blockNumber < TOPUP_CONFIRMATIONS) {
      return Response.json({ error: 'pending', retry: true }, { status: 202 })
    }
  } catch {
    return Response.json({ error: 'pending', retry: true }, { status: 202 })
  }

  const points = BigInt(pack.points) * MILLI

  const { data, error } = await admin.rpc('free_credit_topup', {
    p_code: code,
    p_player: playerId,
    p_tx: txHash,
    p_payer: String(tx.from || ''),
    p_wei: tx.value.toString(),
    p_points: Number(points),
  })

  if (error) {
    // 23505: this hash was already credited. Idempotent by design — a client
    // that retried a slow request should see success, not a scary error.
    if (error.code === '23505' || /duplicate key|unique/i.test(error.message || '')) {
      return Response.json({ ok: true, alreadyCredited: true, points: milliToWei(points) })
    }
    if (/not_joined/.test(error.message || '')) {
      return Response.json({ error: 'Join the room before buying points.' }, { status: 403 })
    }
    return Response.json({ error: 'Could not credit those points.' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  return Response.json({
    ok: true,
    points: milliToWei(points),
    purse: milliToWei(row.purse),
    bought: milliToWei(row.bought),
  })
}
