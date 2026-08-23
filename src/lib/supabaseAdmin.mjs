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

/**
 * Catch the two mistakes that otherwise surface as a flat "Invalid API key"
 * from Supabase, which tells you nothing about which of the two it was:
 *   - the placeholder from the setup instructions left in place
 *   - the PUBLISHABLE key pasted where the secret one belongs (easy to do;
 *     they sit next to each other in the dashboard and look alike)
 */
function keyProblem(k) {
  if (!k) return 'SUPABASE_SERVICE_ROLE_KEY is not set'
  if (/^(your|my|paste|xxx|<)/i.test(k) || k.length < 30) {
    return 'SUPABASE_SERVICE_ROLE_KEY still looks like a placeholder'
  }
  if (k.startsWith('sb_publishable_')) {
    return 'SUPABASE_SERVICE_ROLE_KEY holds a PUBLISHABLE key — free rooms need the secret one (sb_secret_…)'
  }
  return null
}

const problem = url ? keyProblem(key) : 'NEXT_PUBLIC_SUPABASE_URL is not set'

let _admin = null
if (!problem) {
  try {
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (e) {
    console.warn('[supabase-admin] disabled:', e?.message || e)
  }
} else {
  console.warn(`[supabase-admin] free rooms disabled — ${problem}`)
}

export const admin = _admin
export const hasAdmin = Boolean(_admin)

/** Uniform 503 when free mode isn't configured, naming the actual problem. */
export const notConfigured = () =>
  Response.json(
    {
      error: `Free rooms are not configured — ${problem || 'Supabase admin client unavailable'}.`,
      help: 'Supabase dashboard → Project Settings → API Keys → Secret keys.',
    },
    { status: 503 },
  )
