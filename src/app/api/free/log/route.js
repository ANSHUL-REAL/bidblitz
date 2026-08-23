import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { normalizeCode, isValidCode, milliToWei } from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A free room's whole history: every lot, and every bid inside it.
 *
 * The on-chain rooms get this for free by replaying contract events. A free
 * room has no chain to read back, so the ledger is assembled here from the rows
 * that ARE the source of truth — which is the same guarantee, just held in
 * Postgres instead of a block.
 *
 * Separate from /api/free/state on purpose. State is polled every second by
 * every phone in the room and must stay small; this is opened deliberately, by
 * one person, and can afford to be the whole story.
 */
export async function GET(request) {
  if (!admin) return notConfigured()

  const code = normalizeCode(new URL(request.url).searchParams.get('code'))
  if (!isValidCode(code)) return Response.json({ error: 'code required' }, { status: 400 })

  const { data: room } = await admin
    .from('free_rooms').select('code, title, closed, lot_count, created_at')
    .eq('code', code).maybeSingle()
  if (!room) return Response.json({ error: 'room not found', code }, { status: 404 })

  const [lotsRes, bidsRes, playersRes] = await Promise.all([
    admin.from('free_lots')
      .select('lot_id, name, image_url, ends_at, created_at, high_bid, high_player, sold')
      .eq('room_code', code).order('lot_id', { ascending: false }).limit(100),
    admin.from('free_bids')
      .select('lot_id, player_id, amount, created_at')
      .eq('room_code', code).order('created_at', { ascending: false }).limit(500),
    admin.from('free_players')
      .select('player_id, name, avatar_seed, entity_id, wins, spent, purse, kicked')
      .eq('room_code', code),
  ])

  const players = playersRes.data || []
  const byId = new Map(players.map((p) => [p.player_id, p]))
  const who = (id) => ({
    addr: id,
    name: byId.get(id)?.name || null,
    seed: byId.get(id)?.avatar_seed || id,
    entityId: byId.get(id)?.entity_id ?? 0,
  })

  // Bucket the bids by lot once, rather than filtering the whole list per lot.
  const byLot = new Map()
  for (const b of bidsRes.data || []) {
    if (!byLot.has(b.lot_id)) byLot.set(b.lot_id, [])
    byLot.get(b.lot_id).push({
      ...who(b.player_id),
      amount: milliToWei(b.amount),
      at: b.created_at,
    })
  }

  const lots = (lotsRes.data || []).map((l) => {
    const won = l.sold && l.high_player && BigInt(l.high_bid || 0) > 0n
    return {
      lotId: l.lot_id,
      name: l.name,
      image: l.image_url,
      sold: Boolean(l.sold),
      // A lot can be "sold" with nobody on it — cancelled, or the clock ran out
      // with no bids. Those are settled, not won, and must not read as a sale.
      won: Boolean(won),
      winner: won ? who(l.high_player) : null,
      amount: milliToWei(l.high_bid || 0),
      at: l.created_at,
      bids: byLot.get(l.lot_id) || [],
    }
  })

  return Response.json({
    code,
    title: room.title,
    closed: Boolean(room.closed),
    startedAt: room.created_at,
    totals: {
      lots: lots.length,
      sold: lots.filter((l) => l.won).length,
      bids: (bidsRes.data || []).length,
      players: players.filter((p) => !p.kicked).length,
    },
    standings: players
      .filter((p) => !p.kicked)
      .map((p) => ({
        addr: p.player_id, name: p.name, seed: p.avatar_seed || p.player_id,
        entityId: p.entity_id, wins: p.wins || 0,
        spent: milliToWei(p.spent), purse: milliToWei(p.purse),
      }))
      .sort((a, b) => (b.wins - a.wins) || (BigInt(b.spent) > BigInt(a.spent) ? 1 : -1)),
    lots,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
