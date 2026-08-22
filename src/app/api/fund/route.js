import { parseEther, isAddress, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  publicClient,
  relayerKeys,
  relayerWallet,
  relayerIndexFor,
} from '../../../lib/server.mjs'
import { acquireLock, releaseLock, nextNonce, resetNonce, hasRedis } from '../../../lib/redis.mjs'
import { feeParams, GAS } from '../../../lib/chain.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FUND_AMOUNT = parseEther(process.env.FUND_AMOUNT || '0.05')
// Threshold, NOT `> 0`. With `> 0`, someone who spends everything can never be
// topped up — which is exactly the moment they need it.
const MIN_BALANCE = parseEther(process.env.MIN_BALANCE || '0.02')

export async function POST(request) {
  const keys = relayerKeys()
  if (!keys.length) {
    return Response.json({ error: 'RELAYER_KEYS not set — run: npm run wallets' }, { status: 503 })
  }

  let address, force
  try {
    ({ address, force } = await request.json())
  } catch {
    return Response.json({ error: 'bad request body' }, { status: 400 })
  }

  if (!isAddress(address)) {
    return Response.json({ error: 'invalid address' }, { status: 400 })
  }

  // Cheap on-chain short-circuit first — handles page reloads and returning
  // users without ever touching the lock.
  const balance = await publicClient.getBalance({ address })
  if (balance >= MIN_BALANCE) {
    return Response.json({ status: 'funded', balance: balance.toString() })
  }

  const lockKey = `fund:${address.toLowerCase()}`
  if (force) await releaseLock(lockKey)

  if (!(await acquireLock(lockKey, 60))) {
    // Another lambda already owns this address. Not an error — the client keeps
    // polling its own balance and will see the other request's tx land.
    return Response.json({ status: 'pending', balance: balance.toString() })
  }

  const idx = relayerIndexFor(address, keys.length)
  const key = keys[idx]
  const wallet = relayerWallet(key)
  const relayer = privateKeyToAccount(key).address

  let nonce
  try {
    nonce = await nextNonce(idx)
    const hash = await wallet.sendTransaction({
      to: address,
      value: FUND_AMOUNT,
      gas: GAS.transfer, // exactly 21000 — never estimate, never pad; billed on limit
      nonce,
      ...feeParams(),
    })

    return Response.json({
      status: 'funding',
      hash,
      relayer: idx,
      nonce,
      amount: FUND_AMOUNT.toString(),
      // The client must wait ~4 blocks after this lands before bidding. A wallet
      // funded at block B had zero balance at B-3, and Monad's reserve-balance
      // rule computes the inflight gas budget from that lagged state — so its
      // first bid would be silently excluded at consensus.
      armBlocks: 4,
      degraded: !hasRedis,
    })
  } catch (err) {
    await releaseLock(lockKey)

    // A nonce allocated but never used leaves a permanent gap, and every later
    // transaction from this relayer queues behind a nonce that will never
    // arrive — wedging it for the rest of the event. Plug it immediately.
    if (nonce !== undefined) {
      try {
        await wallet.sendTransaction({
          to: relayer,
          value: 0n,
          gas: GAS.transfer,
          nonce,
          ...feeParams(),
        })
      } catch {
        // If the gap-filler also fails the relayer is likely wedged.
        // Recover with: GET /api/fund?heal=<ADMIN_SECRET>
      }
    }

    return Response.json(
      { error: String(err?.shortMessage || err?.message || err), relayer: idx },
      { status: 502 },
    )
  }
}

/**
 * Ten-second recovery if a relayer wedges mid-event: re-seed every nonce counter
 * from what the chain actually reports.
 *   GET /api/fund?heal=<ADMIN_SECRET>
 */
export async function GET(request) {
  const url = new URL(request.url)

  if (url.searchParams.has('ping')) {
    return Response.json({ ok: true }) // route warmer — keeps lambdas hot before doors
  }

  const secret = url.searchParams.get('heal')
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const keys = relayerKeys()
  const healed = await Promise.all(
    keys.map(async (k, i) => {
      const address = privateKeyToAccount(k).address
      const [count, balance] = await Promise.all([
        publicClient.getTransactionCount({ address, blockTag: 'latest' }),
        publicClient.getBalance({ address }),
      ])
      await resetNonce(i, count)
      return { relayer: i, address, nonce: count, balance: formatEther(balance) }
    }),
  )

  return Response.json({ healed, redis: hasRedis })
}
