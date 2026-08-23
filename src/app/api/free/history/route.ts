import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { milliToWei } from '../../../../lib/freeRoom.mjs'
import type { FreeHistoryEntry, FreeHistoryResponse } from '../../../../lib/freeTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every room this account has played.
 *
 * The account is resolved from the bearer token by Supabase, never taken from
 * the request body. A user id in a payload is a claim, not proof — accepting
 * one would let anybody read anybody's history by guessing a uuid.
 */

interface HistoryRow {
  code: string
  title: string | null
  played_at: string
  closed: boolean
  wins: number | null
  spent: number | null
  purse: number | null
  bought: number | null
  lots: number | null
  players: number | null
}

export async function GET(request: Request): Promise<Response> {
  if (!admin) return notConfigured()

  const auth = request.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) {
    return Response.json({ error: 'Sign in to see your history.' }, { status: 401 })
  }

  // Supabase validates the JWT (signature AND expiry) and hands back the user.
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) {
    return Response.json({ error: 'That session has expired — sign in again.' }, { status: 401 })
  }

  const { data, error } = await admin.rpc('free_history', { p_user: user.id, p_limit: 50 })
  if (error) {
    return Response.json({ error: 'Could not load your history.' }, { status: 500 })
  }

  const rows: HistoryRow[] = Array.isArray(data) ? data : []

  const history: FreeHistoryEntry[] = rows.map((r) => ({
    code: r.code,
    title: r.title ?? 'Untitled room',
    playedAt: r.played_at,
    closed: Boolean(r.closed),
    wins: r.wins ?? 0,
    spent: milliToWei(r.spent ?? 0),
    purse: milliToWei(r.purse ?? 0),
    bought: milliToWei(r.bought ?? 0),
    lots: r.lots ?? 0,
    players: r.players ?? 0,
  }))

  const totals: FreeHistoryResponse['totals'] = {
    rooms: history.length,
    wins: history.reduce((n, h) => n + h.wins, 0),
    // Summed as a bigint: these are wei strings, and adding them as numbers
    // would quietly lose precision above 2^53.
    spent: history.reduce((sum, h) => sum + BigInt(h.spent), 0n).toString(),
  }

  const body: FreeHistoryResponse = { history, totals }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
