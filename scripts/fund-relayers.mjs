/**
 * Seeds the relayer pool from the master wallet. Run ONCE before doors open.
 *
 *   npm run fund-relayers -- 0.6      (MON per relayer; default 0.5)
 *
 * Why a pool rather than one hot wallet: Monad's consensus enforces a gas-spend
 * budget across all inflight transactions in the last 3 blocks. A single wallet
 * fanning out 70 funding transfers blows past it and later transactions are
 * silently EXCLUDED at consensus — no revert, no receipt, nothing to debug.
 * Eight independent nonce sequences keep every relayer well inside the budget.
 */
import { parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, walletFor, accountFor } from './lib/clients.mjs'
import { requireEnv } from './lib/env.mjs'
import { feeParams, GAS, txUrl } from '../src/lib/chain.mjs'

const perRelayer = parseEther(process.argv[2] || '0.5')

const masterKey = requireEnv('MASTER_KEY')
const relayerKeys = requireEnv('RELAYER_KEYS').split(',').map((k) => k.trim()).filter(Boolean)

const master = accountFor(masterKey)
const wallet = walletFor(masterKey)

const balance = await publicClient.getBalance({ address: master.address })
const needed = perRelayer * BigInt(relayerKeys.length)
const gasCost = GAS.transfer * 200_000_000_000n * BigInt(relayerKeys.length)

console.log(`\n  master     ${master.address}`)
console.log(`  balance    ${formatEther(balance)} MON`)
console.log(`  relayers   ${relayerKeys.length} x ${formatEther(perRelayer)} MON = ${formatEther(needed)} MON\n`)

if (balance < needed + gasCost) {
  console.error(`  Not enough MON. Need ~${formatEther(needed + gasCost)}, have ${formatEther(balance)}.`)
  console.error(`  Lower the amount:  npm run fund-relayers -- 0.2\n`)
  process.exit(1)
}

// Sequential, with an explicit nonce. Parallel sends from one wallet is exactly
// the pattern that trips the inflight gas budget.
let nonce = await publicClient.getTransactionCount({ address: master.address, blockTag: 'latest' })

for (const [i, key] of relayerKeys.entries()) {
  const relayer = privateKeyToAccount(key).address
  const have = await publicClient.getBalance({ address: relayer })

  if (have >= perRelayer) {
    console.log(`  relayer ${i}  ${relayer}  already has ${formatEther(have)} MON — skipping`)
    continue
  }

  const hash = await wallet.sendTransaction({
    to: relayer,
    value: perRelayer - have,
    gas: GAS.transfer,
    nonce: nonce++,
    ...feeParams(),
  })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`  relayer ${i}  ${relayer}  funded   ${txUrl(hash)}`)
}

const after = await publicClient.getBalance({ address: master.address })
console.log(`\n  master left  ${formatEther(after)} MON`)
console.log(`  Next: set UPSTASH_* in .env, then test:  curl -X POST .../api/fund\n`)
