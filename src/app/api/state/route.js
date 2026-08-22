import { publicClient, CONTRACT, BIDBLITZ_ABI, jsonSafe } from '../../../lib/server.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE eth_call for a room's entire auction state, fanned out over HTTP.
 *
 * This is the decision that lets a whole room watch a live auction. If each
 * phone watched contract events directly that would be ~140rps against a 50rps
 * cap — and because rate limits are per-IP and a venue shares one IP, the room
 * would take itself down. Here the chain read rate is constant regardless of
 * how many people are watching.
 *
 * The CDN header matters as much as the call: a module-level cache fragments
 * across serverless instances (~20rps against the 25rps eth_call bucket),
 * whereas s-maxage collapses every request into ~1 origin hit per second at the
 * edge.
 */

const TTL_MS = 400
const cache = new Map() // roomId -> { at, body }

export async function GET(request) {
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set — deploy first' }, { status: 503 })
  }

  const url = new URL(request.url)
  const live = url.searchParams.has('live')
  const roomId = Number(url.searchParams.get('room') || 0)

  if (!roomId) {
    return Response.json({ error: 'room required' }, { status: 400 })
  }

  const now = Date.now()
  const hit = cache.get(roomId)
  if (!live && hit && now - hit.at < TTL_MS) {
    return json(hit.body, false, true)
  }

  try {
    const s = await publicClient.readContract({
      address: CONTRACT,
      abi: BIDBLITZ_ABI,
      functionName: 'state',
      args: [roomId],
    })

    if (!s.exists) {
      return Response.json({ error: 'room not found', roomId }, { status: 404 })
    }

    // Bid history for the race track. Done here rather than per-client for the
    // same reason as everything else on this route: one call for the whole room.
    const racers = await recentBidders(roomId, s)

    const body = { ...jsonSafe(s), roomId, racers, contract: CONTRACT, fetchedAt: now }

    if (!live) cache.set(roomId, { at: now, body })
    return json(body, live, false)
  } catch (err) {
    // Serve stale rather than nothing — a momentarily frozen screen beats a
    // blank one, and RPC blips are expected on venue wifi.
    if (hit?.body) return json({ ...hit.body, stale: true }, live, true)
    return Response.json({ error: String(err?.shortMessage || err?.message || err) }, { status: 502 })
  }
}

/**
 * Distinct bidders on the current lot, best bid first — the data behind the race
 * track. Read from BidPlaced logs because the contract deliberately stores only
 * the current leader; keeping a full bid array on-chain would cost a cold SSTORE
 * per bid, and at 8,100 gas each that is real MON for what logs give us free.
 */
async function recentBidders(roomId, s) {
  const lotId = Number(s.lotId || 0)
  if (!lotId) return []

  try {
    const head = await publicClient.getBlockNumber()
    // The public RPC rejects eth_getLogs ranges over ~96 blocks, so stay well
    // under it: 90 blocks ≈ 27s at 300ms — enough to show the current lot's
    // bidders racing. (A private MONAD_RPC_URL lifts this limit for more history.)
    const fromBlock = head > 90n ? head - 90n : 0n

    const logs = await publicClient.getLogs({
      address: CONTRACT,
      event: BIDBLITZ_ABI.find((x) => x.type === 'event' && x.name === 'BidPlaced'),
      args: { roomId, lotId },
      fromBlock,
      toBlock: 'latest',
    })

    const best = new Map()
    for (const log of logs) {
      const { bidder, entityId, amount } = log.args
      const prev = best.get(bidder)
      if (!prev || amount > prev.amount) {
        best.set(bidder, { bidder, entityId: Number(entityId), amount, bids: (prev?.bids ?? 0) + 1 })
      } else {
        prev.bids += 1
      }
    }

    return [...best.values()]
      .sort((a, b) => (b.amount > a.amount ? 1 : -1))
      .slice(0, 5)
      .map((r) => ({ ...r, amount: r.amount.toString() }))
  } catch {
    return [] // never let the race track break the whole state payload
  }
}

function json(body, live, cached) {
  return Response.json(body, {
    headers: {
      'Cache-Control': live ? 'no-store' : 'public, s-maxage=1, stale-while-revalidate=30',
      'X-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}
