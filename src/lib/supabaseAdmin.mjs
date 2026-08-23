import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase, service role. NEVER import this from a client
 * component — the key bypasses RLS entirely.
 *
 * Free rooms exist because they cost nobody anything, which also means there is
 * no wallet in them and therefore no signature to check. If the browser could
 * write to the free_* tables directly, any player could set their own purse,
 * bid as somebody else, or sell a lot to themselves. So those tables deny anon
 * completely (RLS on, no policies) and every write comes through here, behind
 * /api/free/* where the rules actually get enforced.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

let _admin = null
try {
  if (url && key) {
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
} catch (e) {
  console.warn('[supabase-admin] disabled:', e?.message || e)
}

export const admin = _admin
export const hasAdmin = Boolean(_admin)

/** Uniform 503 when free mode isn't configured, rather than a confusing crash. */
export const notConfigured = () =>
  Response.json(
    { error: 'Free rooms need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' },
    { status: 503 },
  )
