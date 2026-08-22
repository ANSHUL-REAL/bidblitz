import { publicClient, CONTRACT, BIDBLITZ_ABI, jsonSafe } from '../../../lib/server.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lobby listing — newest rooms first. Cached at the edge like /api/state. */
export async function GET(request) {
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set — deploy first' }, { status: 503 })
  }

  const limit = Math.min(24, Number(new URL(request.url).searchParams.get('limit') || 12))

  try {
    const rooms = await publicClient.readContract({
      address: CONTRACT,
      abi: BIDBLITZ_ABI,
      functionName: 'recentRooms',
      args: [limit],
    })
    return Response.json({ rooms: jsonSafe(rooms) }, {
      headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=30' },
    })
  } catch (err) {
    return Response.json({ error: String(err?.shortMessage || err?.message || err) }, { status: 502 })
  }
}
