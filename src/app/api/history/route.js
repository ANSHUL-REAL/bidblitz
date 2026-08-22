import { publicClient, CONTRACT, BIDBLITZ_ABI, jsonSafe } from '../../../lib/server.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Live transaction history for a room, read straight from the chain — so it is
 * complete (every bid from every device, not just this one) and independently
 * verifiable: every row carries the real tx hash. This is the "show it live as
 * proof" feed. Money events (bids, sales, refunds, host withdrawals) come with
 * an amount; joins/lot-starts give the timeline context.
 */
const evt = (name) => BIDBLITZ_ABI.find((x) => x.type === 'event' && x.name === name)

// roomId-indexed events we can filter server-side.
const ROOM_EVENTS = ['BidPlaced', 'LotSold', 'LotUnsold', 'Refunded', 'LotStarted', 'Joined']

export async function GET(request) {
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set — deploy first' }, { status: 503 })
  }

  const roomId = Number(new URL(request.url).searchParams.get('room') || 0)
  if (!roomId) return Response.json({ error: 'room required' }, { status: 400 })

  try {
    const head = await publicClient.getBlockNumber()
    // ~40k blocks ≈ 3+ hours at 300ms — covers a whole event session.
    const fromBlock = head > 40000n ? head - 40000n : 0n

    const perType = await Promise.all(
      ROOM_EVENTS.map((name) =>
        publicClient
          .getLogs({ address: CONTRACT, event: evt(name), args: { roomId }, fromBlock, toBlock: 'latest' })
          .then((logs) => logs.map((l) => ({ kind: name, log: l })))
          .catch(() => []),
      ),
    )

    // Withdrawn isn't room-indexed (it's per-wallet), so pull all in-window and
    // include them — they are the proof MON actually reached a wallet.
    const withdrawn = await publicClient
      .getLogs({ address: CONTRACT, event: evt('Withdrawn'), fromBlock, toBlock: 'latest' })
      .then((logs) => logs.map((l) => ({ kind: 'Withdrawn', log: l })))
      .catch(() => [])

    const rows = [...perType.flat(), ...withdrawn]
      .map(({ kind, log }) => ({
        kind,
        txHash: log.transactionHash,
        block: Number(log.blockNumber),
        logIndex: Number(log.logIndex),
        args: jsonSafe(log.args),
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
