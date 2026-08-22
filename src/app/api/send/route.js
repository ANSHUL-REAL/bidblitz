import { publicClient } from '../../../lib/server.mjs'
import { redis } from '../../../lib/redis.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Raw-transaction proxy — the DEFAULT write path for phones, not a fallback.
 *
 * Four reasons it beats phones talking to the RPC directly:
 *   - Rate limits are per-IP and the whole venue shares one IP. This moves the
 *     call to Vercel's IP, so 70 phones stop competing with each other.
 *   - Server-side RPC fallback: one dead endpoint doesn't break the room.
 *   - Phones only ever talk to your own domain, so a captive portal or a
 *     blocked third-party host can't kill bidding.
 *   - Gives you the "we did N real transactions" number for the pitch.
 *
 * No trust regression: the payload is already signed. The server can drop it,
 * but cannot alter it.
 */
export async function POST(request) {
  let raw
  try {
    ({ raw } = await request.json())
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  if (typeof raw !== 'string' || !raw.startsWith('0x')) {
    return Response.json({ error: 'expected a signed raw transaction' }, { status: 400 })
  }

  try {
    const hash = await publicClient.request({
      method: 'eth_sendRawTransaction',
      params: [raw],
    })

    // Fire-and-forget — never let the stat counter delay a bid.
    if (redis) redis.incr('stats:txs').catch(() => {})

    // NOTE: a 200 here is NOT acceptance. On Monad, eth_sendRawTransaction
    // returns OK even for nonce-gapped or underfunded transactions. The client
    // confirms by seeing itself as lead bidder in /api/state, never by trusting
    // this response.
    return Response.json({ hash })
  } catch (err) {
    const message = String(err?.details || err?.shortMessage || err?.message || err)
    return Response.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  const txs = redis ? await redis.get('stats:txs').catch(() => null) : null
  return Response.json({ ok: true, txs: Number(txs || 0) })
}
