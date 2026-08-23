import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { normalizeCode, isValidCode, milliToWei } from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A free room's whole state, in the SAME shape /api/state returns for an
 * on-chain room.
 *
 * That symmetry is the point: the bid bar, race track, leaderboard and big
 * screen are all written against this payload, so free rooms reuse every one of
 * them instead of growing a parallel set that drifts. The only honest
 * differences are `free: true` and `unit`, which the UI uses to make sure a
 * free room never claims to be moving MON.
 *
 * `chainNow` is the SERVER's clock rather than a chain's, and every countdown
 * anchors to it. A room full of phones with skewed clocks would otherwise
 * disagree about when a lot ends.
 */
const TTL_MS = 400
const cache = new Map()

export async function GET(request) {
  if (!admin) return notConfigured()

  const url = new URL(request.url)
  const live = url.searchParams.has('live')
  // The host console wants the whole bid ledger. Phones must not pay for it
  // on every poll, so it is opt-in and never cached alongside the lean body.
  const full = url.searchParams.has('full')
  const code = normalizeCode(url.searchParams.get('code'))
  if (!isValidCode(code)) return Response.json({ error: 'code required' }, { status: 400 })

  const now = Date.now()
  const hit = cache.get(code)
  if (!live && !full && hit && now - hit.at < TTL_MS) return json(hit.body, false, true)

  try {
    const { data: room, error } = await admin
      .from('free_rooms')
      .select('code, title, mode, categories, open_lot, lot_count, closed, host_name, max_bid')
      .eq('code', code)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!room) return Response.json({ error: 'room not found', code }, { status: 404 })

    // Falls back to the most recent lot so the SOLD reveal stays on screen after
    // the lot closes, instead of blanking — same rule as the contract's view.
    const lotId = room.open_lot || room.lot_count || 0

    const [lotRes, playersRes] = await Promise.all([
      lotId
        ? admin.from('free_lots')
            .select('lot_id, name, image_url, ends_at, created_at, high_bid, high_player, sold')
            .eq('room_code', code).eq('lot_id', lotId).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from('free_players')
        .select('player_id, entity_id, purse, spent, wins, name, avatar_seed, squad, kicked, is_bot')
        .eq('room_code', code),
    ])

    const lot = lotRes.data
    // Removed players keep their rows (their bids stay in the ledger) but drop
    // out of the room: no leaderboard entry, no headcount, no race lane.
    const players = (playersRes.data || []).filter((p) => !p.kicked)
    const byId = new Map(players.map((p) => [p.player_id, p]))

    const racers = lotId ? await recentBidders(code, lotId, byId) : []

    const body = {
      free: true,
      unit: 'PTS',            // never "MON" — a free room moves nothing
      escrow: false,
      exists: true,
      code,
      roomId: code,           // the components key off this; a code works fine
      rname: room.title,
      host: room.host_name || null,
      mode: Number(room.mode || 0),
      categories: room.categories || [],
      // Sent to everyone: the bid bar has to grey out steps above it, or
      // people tap a button that can only be refused.
      maxBid: milliToWei(room.max_bid ?? 0),
      closed: Boolean(room.closed),
      openLotId: room.open_lot || 0,
      totalLots: room.lot_count || 0,
      lotId,
      lname: lot?.name || '',
      limage: lot?.image_url || '',
      highestBid: milliToWei(lot?.high_bid || 0),
      endsAt: lot ? Math.floor(new Date(lot.ends_at).getTime() / 1000) : 0,
      // How long the lot was given, so a progress bar has a denominator.
      // Derived rather than stored: ends_at and created_at already say it.
      duration: lot
        ? Math.max(1, Math.round((new Date(lot.ends_at) - new Date(lot.created_at)) / 1000))
        : 0,
      leadEntity: lot?.high_player ? byId.get(lot.high_player)?.entity_id ?? 0 : 0,
      bidder: lot?.high_player || null,
      sold: Boolean(lot?.sold),
      nEntities: players.length,
      squadPurses: squadPurses(room.mode, players),
      chainNow: Math.floor(now / 1000),
      racers,
      bids: full ? await lotBids(code, lotId, byId) : undefined,
      queue: full ? await roomQueue(code) : undefined,
      // Who won what. Needed for the closing board, and cheap enough to
      // include for the host console too. Omitted from the phones' poll.
      results: (full || room.closed) ? await roomResults(code, byId) : undefined,
      players: players.map((p) => ({
        addr: p.player_id,
        entityId: p.entity_id,
        name: p.name,
        avatarSeed: p.avatar_seed,
        squad: p.squad,
        purse: milliToWei(p.purse),
        spent: milliToWei(p.spent),
        wins: p.wins || 0,
        // Labelled honestly rather than passed off as a person.
        bot: Boolean(p.is_bot),
      })),
      fetchedAt: now,
    }

    if (!live && !full) cache.set(code, { at: now, body })
    return json(body, live, false)
  } catch (err) {
    // Serve stale rather than nothing — a frozen screen beats a blank one.
    if (hit?.body) return json({ ...hit.body, stale: true }, live, true)
    return Response.json({ error: String(err?.message || err) }, { status: 502 })
  }
}

/** Best bid per distinct bidder on the current lot — the race track's data. */
async function recentBidders(code, lotId, byId) {
  const { data } = await admin
    .from('free_bids')
    .select('player_id, amount')
    .eq('room_code', code).eq('lot_id', lotId)
    .order('amount', { ascending: false })
    .limit(200)

  const best = new Map()
  for (const b of data || []) {
    const prev = best.get(b.player_id)
    if (!prev) best.set(b.player_id, { amount: BigInt(b.amount), bids: 1 })
    else prev.bids += 1 // rows arrive best-first, so the first is already the max
  }

  return [...best.entries()]
    .sort((a, b) => (b[1].amount > a[1].amount ? 1 : -1))
    .slice(0, 5)
    .map(([playerId, r]) => ({
      bidder: playerId,
      entityId: byId.get(playerId)?.entity_id ?? 0,
      amount: milliToWei(r.amount),
      bids: r.bids,
    }))
}

/**
 * Every bid on the current lot, newest first — the host's running ledger.
 *
 * Unlike the race track (best bid per bidder) this keeps duplicates, because
 * the host is narrating a live auction and "who has bid, in what order" is the
 * thing they are reading out.
 */
async function lotBids(code, lotId, byId) {
  if (!lotId) return []
  const { data } = await admin
    .from('free_bids')
    .select('player_id, amount, created_at')
    .eq('room_code', code).eq('lot_id', lotId)
    .order('created_at', { ascending: false })
    .limit(60)

  return (data || []).map((b) => ({
    bidder: b.player_id,
    name: byId.get(b.player_id)?.name || null,
    entityId: byId.get(b.player_id)?.entity_id ?? 0,
    amount: milliToWei(b.amount),
    at: b.created_at,
  }))
}

/**
 * Every lot that has been settled, with who took it.
 *
 * The closing board is "who won which items", not a column of totals — an
 * auction's story is the individual lots, and a room wants to see the list
 * read back at the end.
 */
async function roomResults(code, byId) {
  const { data } = await admin
    .from('free_lots')
    .select('lot_id, name, image_url, high_bid, high_player, sold')
    .eq('room_code', code)
    .eq('sold', true)
    .order('lot_id', { ascending: true })
    .limit(200)

  return (data || [])
    .filter((l) => l.high_player && BigInt(l.high_bid || 0) > 0n)
    .map((l) => ({
      lotId: l.lot_id,
      name: l.name,
      image: l.image_url,
      winner: l.high_player,
      winnerName: byId.get(l.high_player)?.name || null,
      winnerSeed: byId.get(l.high_player)?.avatar_seed || l.high_player,
      amount: milliToWei(l.high_bid),
    }))
}

/** The host's prepared catalogue: what is still to come, and what already ran. */
async function roomQueue(code) {
  const { data } = await admin
    .from('free_items')
    .select('id, name, image_url, sort_order, lot_id')
    .eq('room_code', code)
    .order('sort_order', { ascending: true })
    .limit(100)

  return (data || []).map((i) => ({
    id: i.id, name: i.name, image: i.image_url, order: i.sort_order, lotId: i.lot_id,
  }))
}

/** Fantasy rooms show four shared purses; solo rooms send an empty list. */
function squadPurses(mode, players) {
  if (Number(mode) !== 1) return []
  const totals = [0n, 0n, 0n, 0n]
  for (const p of players) {
    const i = Number(p.squad || 0) - 1
    if (i >= 0 && i < 4) totals[i] += BigInt(p.purse)
  }
  return totals.map((t) => milliToWei(t))
}

function json(body, live, cached) {
  return Response.json(body, {
    headers: {
      'Cache-Control': live ? 'no-store' : 'public, s-maxage=1, stale-while-revalidate=30',
      'X-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}
