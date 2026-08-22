import { publicClient, CONTRACT, BIDBLITZ_ABI, jsonSafe } from '../../../lib/server.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE eth_call for the entire auction state, fanned out over HTTP.
 *
 * This is the decision that lets 70 phones watch a live auction. If each phone
 * watched contract events directly, that would be ~140rps against a 50rps cap —
 * and because rate limits are per-IP and the whole venue shares one IP, the
 * room would take itself down. Here the chain read rate is constant regardless
 * of audience size.
 *
 * The CDN header matters as much as the call: a module-level cache fragments
 * across Vercel instances (~20rps against the 25rps eth_call bucket), whereas
 * s-maxage collapses all 70 requests into ~1 origin hit per second at the edge.
 */

let cache = { at: 0, body: null }
const TTL_MS = 400

export async function GET(request) {
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set — deploy first' }, { status: 503 })
  }

  const live = new URL(request.url).searchParams.has('live')
  const now = Date.now()

  if (!live && cache.body && now - cache.at < TTL_MS) {
    return json(cache.body, false, true)
  }

  try {
    const s = await publicClient.readContract({
      address: CONTRACT,
      abi: BIDBLITZ_ABI,
      functionName: 'state',
    })

    // Bid history for the race track. Done here rather than per-client for the
    // same reason as everything else on this route: one call for the whole room.
    const racers = await recentBidders(s)

    const body = {
      ...jsonSafe(s),
      racers,
      contract: CONTRACT,
      fetchedAt: now,
    }

    if (!live) cache = { at: now, body }
    return json(body, live, false)
  } catch (err) {
    // Serve stale rather than nothing — a momentarily frozen screen beats a
    // blank one, and RPC blips are expected on venue wifi.
    if (cache.body) return json({ ...cache.body, stale: true }, live, true)
    return Response.json({ error: String(err?.shortMessage || err?.message || err) }, { status: 502 })
  }
}

/**
 * Recent distinct bidders on the current lot, best bid first — the data behind
 * the race track. Read from BidPlaced logs because the contract deliberately
 * stores only the current leader; keeping a full bid array on-chain would cost
 * a cold SSTORE per bid, and at 8,100 gas each that is real MON for something
 * the logs already give us free.
 */
async function recentBidders(s) {
  const lotId = BigInt(s.lotId || 0)
  if (lotId === 0n) return []

  try {
    const head = await publicClient.getBlockNumber()
    // 300ms blocks, so 1200 blocks is ~6 minutes — comfortably longer than any lot.
    const fromBlock = head > 1200n ? head - 1200n : 0n

    const logs = await publicClient.getLogs({
      address: CONTRACT,
      event: BIDBLITZ_ABI.find((x) => x.type === 'event' && x.name === 'BidPlaced'),
      args: { lotId },
      fromBlock,
      toBlock: 'latest',
    })

    const best = new Map()
    for (const log of logs) {
      const { bidder, entityId, amount } = log.args
      const prev = best.get(bidder)
      if (!prev || amount > prev.amount) {
        best.set(bidder, {
          bidder,
          entityId: Number(entityId),
          amount,
          bids: (prev?.bids ?? 0) + 1,
        })
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
      'Cache-Control': live
        ? 'no-store'
        : 'public, s-maxage=1, stale-while-revalidate=30',
      'X-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}
