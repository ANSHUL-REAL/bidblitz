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
  // MASTER_KEY is a LOCAL developer key now — it deploys the contract and funds
  // the bot script. It is not deployed anywhere and never pays for a real
  // participant's gas; everyone in a room brings their own MON.
  if (process.env.MASTER_KEY) targets.push(['MASTER', privateKeyToAccount(process.env.MASTER_KEY).address])
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

/**
 * This number no longer sizes the event.
 *
 * It used to: MASTER funded an 8-relayer pool that airdropped every joiner, so
 * the balance here capped how many people could bid. That pool is gone —
 * participants bring their own MON — and MASTER is now just a local dev key
 * with two jobs: deploy the contract once, and fund the bot script.
 */
console.log(`\n  ${addressUrl(master[1])}\n`)
console.log(`  ── ${mon.toFixed(3)} MON in the local dev wallet ──`)
if (mon >= 1) {
  console.log(`  Plenty. Deploy costs well under 1 MON; bots take 0.05 MON each.`)
} else if (mon >= 0.2) {
  console.log(`  Enough to deploy. Top up before running a full bot swarm.`)
} else {
  console.log(`  Low. Claim from the faucet before deploying: https://faucet.monad.xyz`)
}
console.log(`\n  Hosts and bidders fund their own wallets — nothing here pays for them.\n`)
