/**
 * The gate. Everything downstream spends MON, so this number picks the architecture.
 * Run it after every faucet claim.
 */
import { formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient } from './lib/clients.mjs'
import { addressUrl } from '../src/lib/chain.mjs'

const arg = process.argv[2]

const targets = []
if (arg?.startsWith('0x') && arg.length === 42) {
  targets.push(['address', arg])
} else {
  if (process.env.MASTER_KEY) targets.push(['MASTER', privateKeyToAccount(process.env.MASTER_KEY).address])
  if (process.env.ORGANIZER_KEY) targets.push(['organizer', privateKeyToAccount(process.env.ORGANIZER_KEY).address])
  for (const [i, k] of (process.env.RELAYER_KEYS || '').split(',').filter(Boolean).entries()) {
    targets.push([`relayer ${i}`, privateKeyToAccount(k.trim()).address])
  }
}

if (!targets.length) {
  console.error('\n  Nothing to check. Set MASTER_KEY in .env, or pass an address:')
  console.error('  npm run balance -- 0xYourAddress\n')
  process.exit(1)
}

const balances = await Promise.all(
  targets.map(async ([label, address]) => [label, address, await publicClient.getBalance({ address })]),
)

const pad = Math.max(...balances.map(([l]) => l.length))
console.log()
for (const [label, address, wei] of balances) {
  console.log(`  ${label.padEnd(pad)}  ${formatEther(wei).padStart(10)} MON   ${address}`)
}

const master = balances.find(([l]) => l === 'MASTER') ?? balances[0]
const mon = Number(formatEther(master[2]))

// The cut ladder from the plan, applied to the actual number.
console.log(`\n  ${addressUrl(master[1])}\n`)
console.log(`  ── Budget verdict on ${mon.toFixed(3)} MON ──`)
if (mon >= 8) {
  console.log(`  COMFORTABLE. Full scope: 16 lots, 0.05 MON/burner, contribute() + badge NFT.`)
} else if (mon >= 4) {
  console.log(`  WORKABLE. Cut in this order as needed:`)
  console.log(`    1. client-side stale-bid guard (biggest lever, also better UX)`)
  console.log(`    2. lazy funding 0.05/burner + top-up below 0.02`)
  console.log(`    3. tight gas limits from measured estimateGas`)
} else if (mon >= 3) {
  console.log(`  TIGHT. Drop contribute() and the badge mint. 8 lots, 0.03 MON/burner.`)
} else {
  console.log(`  TOO LOW for per-phone transactions.`)
  console.log(`  Switch to batched meta-transactions (burners sign EIP-712, one`)
  console.log(`  relayer submits batched, ~0.12 MON total) — or demo with bots only.`)
  console.log(`  Make this call NOW, not at hour 4.`)
}
console.log()
