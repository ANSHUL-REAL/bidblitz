import { admin, notConfigured } from '../../../../lib/supabaseAdmin.mjs'
import { bump } from '../../../../lib/redis.mjs'
import { makeRoomCode, sanitizeText } from '../../../../lib/freeRoom.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create a free room.
 *
 * The host's browser generated a token and sends only its SHA-256 hash; that
 * hash is the room's credential, since a free room has no wallet to prove
 * ownership with. We never see the token itself, so a database leak does not
 * hand anyone a room.
 *
 * Rate limited by IP because this is the one free endpoint that creates rows
 * out of nothing. Nobody can drain a treasury here — there isn't one — but a
 * loop could still fill the table.
 */
const MAX_ROOMS_PER_HOUR = 20

export async function POST(request) {
  if (!admin) return notConfigured()

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  const title = sanitizeText(body?.title, 40)
  const hostTokenHash = String(body?.hostTokenHash || '')
  const hostName = sanitizeText(body?.hostName, 40) || null
  const mode = Number(body?.mode) === 1 ? 1 : 0
  const categories = Array.isArray(body?.categories) ? body.categories.slice(0, 12) : []

  if (!title) return Response.json({ error: 'title required' }, { status: 400 })
  if (!/^[0-9a-f]{64}$/.test(hostTokenHash)) {
    return Response.json({ error: 'bad host token' }, { status: 400 })
  }

  // Hosting requires an account, so the room can be owned by one — which is
  // what puts rooms someone RAN into their history, not just ones they played.
  let hostUserId = null
  const auth = request.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    try {
      const { data } = await admin.auth.getUser(auth.slice(7).trim())
      hostUserId = data?.user?.id ?? null
    } catch { hostUserId = null }
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if ((await bump(`free:create:${ip}`, 3600)) > MAX_ROOMS_PER_HOUR) {
    return Response.json({ error: 'Too many rooms from this network. Try again later.' }, { status: 429 })
  }

  // Retry on collision rather than pre-checking: the code space is 32^4 (~1M)
  // and the primary key is the only thing that can actually adjudicate a race
  // between two hosts creating a room in the same millisecond.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeRoomCode()
    const { data, error } = await admin
      .from('free_rooms')
      .insert({
        code,
        title,
        mode,
        categories,
        host_token_hash: hostTokenHash,
        host_name: hostName,
        host_user_id: hostUserId,
      })
      .select('code, title, mode, categories')
      .single()

    if (!error) return Response.json({ room: data })
    if (error.code !== '23505') {
      return Response.json({ error: error.message }, { status: 500 })
    }
  }

  return Response.json({ error: 'could not allocate a room code' }, { status: 503 })
}
