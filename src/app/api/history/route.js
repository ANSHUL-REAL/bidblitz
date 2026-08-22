import { publicClient, CONTRACT, BIDBLITZ_ABI, jsonSafe } from '../../../lib/server.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Live transaction history for a room, read straight from the chain — complete
 * (every device's bids, not just this one) and verifiable (each row has the real
 * tx hash).
 *
 * The public Monad RPC caps eth_getLogs at ~96 blocks, so we can't ask for a
 * wide window in one call. Instead we sweep the recent past in small chunks in
 * parallel, pulling ALL event types per chunk (one call, no per-type fan-out)
 * and filtering by roomId in JS. A private MONAD_RPC_URL would lift the cap and
 * let this be a single wide query. Withdrawn isn't room-indexed, so it's kept
 * regardless (it's the proof MON reached a wallet).
 */
const WANT = ['BidPlaced', 'LotSold', 'LotUnsold', 'Refunded', 'LotStarted', 'Joined', 'Withdrawn']
const EVENT_ABIS = BIDBLITZ_ABI.filter((x) => x.type === 'event' && WANT.includes(x.name))
const CHUNK = 85n   // safely under the ~96-block getLogs cap
const CHUNKS = 8    // ~680 blocks ≈ 3.4 min of history

export async function GET(request) {
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set — deploy first' }, { status: 503 })
  }
  const roomId = Number(new URL(request.url).searchParams.get('room') || 0)
  if (!roomId) return Response.json({ error: 'room required' }, { status: 400 })

  try {
    const head = await publicClient.getBlockNumber()
    const ranges = []
    for (let i = 0; i < CHUNKS; i++) {
      const to = head - BigInt(i) * (CHUNK + 1n)
      if (to <= 0n) break
      const from = to > CHUNK ? to - CHUNK : 0n
      ranges.push([from, to])
      if (from === 0n) break
    }

    const chunks = await Promise.all(
      ranges.map(([from, to]) =>
        publicClient.getLogs({ address: CONTRACT, events: EVENT_ABIS, fromBlock: from, toBlock: to }).catch(() => []),
      ),
    )

    const rid = BigInt(roomId)
    const rows = chunks.flat()
      .filter((l) => l.eventName === 'Withdrawn' || (l.args?.roomId != null && BigInt(l.args.roomId) === rid))
      .map((l) => ({
        kind: l.eventName,
        txHash: l.transactionHash,
        block: Number(l.blockNumber),
        logIndex: Number(l.logIndex),
        args: jsonSafe(l.args),
      }))
      .sort((a, b) => (b.block - a.block) || (b.logIndex - a.logIndex))
      .slice(0, 80)

    return Response.json(
      { events: rows, head: Number(head) },
      { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=15' } },
    )
  } catch (err) {
    return Response.json({ error: String(err?.shortMessage || err?.message || err) }, { status: 502 })
  }
}
