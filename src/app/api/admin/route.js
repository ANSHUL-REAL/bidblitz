import { createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monad, feeParams, GAS } from '../../../lib/chain.mjs'
import { publicClient, transport, CONTRACT, BIDBLITZ_ABI } from '../../../lib/server.mjs'
import { sanitizeLotName } from '../../../lib/lots.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Organizer control plane. The organizer key lives here, never in a browser.
 *
 * The secret arrives in a POST body rather than a query string: query strings
 * are logged by Vercel, leak through Referer headers, and are visible on screen
 * if the admin tab ever gets projected.
 */

const organizer = () => {
  const key = process.env.ORGANIZER_KEY
  if (!key) throw new Error('ORGANIZER_KEY not set — run: npm run wallets')
  return createWalletClient({ account: privateKeyToAccount(key), chain: monad, transport })
}

const write = async (functionName, args, gas) => {
  const wallet = organizer()
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi: BIDBLITZ_ABI,
    functionName,
    args,
    gas,
    ...feeParams(),
  })
  return hash
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  const expected = process.env.ADMIN_SECRET
  if (!expected || body.secret !== expected) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!CONTRACT) {
    return Response.json({ error: 'NEXT_PUBLIC_CONTRACT not set' }, { status: 503 })
  }

  try {
    switch (body.action) {
      case 'auth':
        return Response.json({ ok: true })

      case 'start': {
        const name = sanitizeLotName(body.name)
        if (!name) return Response.json({ error: 'lot name required' }, { status: 400 })
        const duration = Math.min(300, Math.max(5, Number(body.duration) || 20))
        const image = String(body.image || '').slice(0, 200)
        const hash = await write('startLot', [name, image, duration], GAS.startLot)
        return Response.json({ ok: true, hash, name, duration })
      }

      case 'sell': {
        // The contract cannot revert here by design — this is pressed on stage.
        const lotId = BigInt(body.lotId ?? 0)
        if (lotId === 0n) return Response.json({ error: 'lotId required' }, { status: 400 })
        const hash = await write('sellLot', [lotId], GAS.sellLot)
        return Response.json({ ok: true, hash })
      }

      case 'close': {
        const hash = await write('closeLot', [], 60_000n)
        return Response.json({ ok: true, hash })
      }

      case 'badgeImage': {
        const hash = await write('setBadgeImage', [String(body.url || '').slice(0, 200)], 80_000n)
        return Response.json({ ok: true, hash })
      }

      default:
        return Response.json({ error: `unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (err) {
    return Response.json(
      { error: String(err?.shortMessage || err?.message || err) },
      { status: 502 },
    )
  }
}

export async function GET() {
  const key = process.env.ORGANIZER_KEY
  if (!key) return Response.json({ ready: false, error: 'ORGANIZER_KEY not set' })
  const address = privateKeyToAccount(key).address
  const balance = await publicClient.getBalance({ address }).catch(() => 0n)
  return Response.json({ ready: true, address, balance: balance.toString(), contract: CONTRACT })
}
