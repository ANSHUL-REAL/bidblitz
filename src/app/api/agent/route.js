export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * AI bidder brain for demo / solo mode. The browser never sees the key: the
 * bot loop POSTs the lot context here, this calls OpenRouter, and returns a
 * structured decision + one line of reasoning to show on screen.
 *
 * Set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in .env. With no key
 * the route returns {action:'fallback'} so the caller uses its heuristic bots —
 * the demo always works, the AI is an upgrade.
 */
const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

export async function POST(request) {
  if (!KEY) return Response.json({ action: 'fallback', reason: 'no OPENROUTER_API_KEY' })

  let body
  try { body = await request.json() } catch { return Response.json({ action: 'fallback' }) }
  const { item = 'this lot', currentBid = 0, budget = 0, persona = 'a bidder', timeLeft = 10, minStep = 0.5 } = body || {}

  const sys = 'You are a competitive but disciplined auction bidder. Reply ONLY with compact JSON: ' +
    '{"action":"bid"|"pass","amount":number,"reasoning":string}. amount is your new total bid in MON, ' +
    'strictly greater than the current bid and within your budget; reasoning is ONE short sentence (max 12 words).'
  const user =
    `Item: "${item}". Current highest bid: ${currentBid} MON. Your budget left: ${budget} MON. ` +
    `Min increment: ${minStep} MON. Time left: ${Math.round(timeLeft)}s. You are "${persona}". ` +
    `Decide whether to bid now. Don't overpay for a ${item}; pass if it's already above what it's worth to you.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500) // never block the auction
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ANSHUL-REAL/bidblitz',
        'X-Title': 'BidBlitz',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    })
    if (!res.ok) return Response.json({ action: 'fallback', reason: `openrouter ${res.status}` })
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || '{}'
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = extractJson(text) }
    if (!parsed || (parsed.action !== 'bid' && parsed.action !== 'pass')) {
      return Response.json({ action: 'fallback', reason: 'unparseable' })
    }
    return Response.json({
      action: parsed.action,
      amount: Number(parsed.amount) || 0,
      reasoning: String(parsed.reasoning || '').slice(0, 120),
      model: MODEL,
    })
  } catch (e) {
    return Response.json({ action: 'fallback', reason: e?.name === 'AbortError' ? 'timeout' : 'error' })
  } finally {
    clearTimeout(timer)
  }
}

function extractJson(s) {
  const m = String(s).match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}
