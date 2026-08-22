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

    const body = {
      ...jsonSafe(s),
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
