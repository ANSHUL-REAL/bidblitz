/**
 *   npm run deploy:ping        prove the pipeline
 *   npm run deploy             deploy BidBlitz, write address to .env
 *
 * Also runs the gas-billing experiment: Monad charges gas_limit, not gas used.
 * This prints the actual balance delta next to receipt.gasUsed so you can
 * confirm the rule empirically instead of trusting the docs. That number drives
 * the entire MON budget, so it is worth the two minutes.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatEther, encodeDeployData } from 'viem'
import { publicClient, walletFor, accountFor } from './lib/clients.mjs'
import { requireEnv, setEnv } from './lib/env.mjs'
import { txUrl, addressUrl, feeParams } from '../src/lib/chain.mjs'

const name = process.argv[2] || 'BidBlitz'
const artifactPath = resolve(process.cwd(), 'artifacts', `${name}.json`)

if (!existsSync(artifactPath)) {
  console.error(`\n  No artifact for "${name}". Run: npm run compile\n`)
  process.exit(1)
}

const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, 'utf8'))
const key = requireEnv('MASTER_KEY')
const account = accountFor(key)
const wallet = walletFor(key)

// Constructor args per contract. BidBlitz takes none — squads and lots are
// created at runtime so a typo never costs a redeploy.
const args = []

const before = await publicClient.getBalance({ address: account.address })
if (before === 0n) {
  console.error(`\n  ${account.address} has 0 MON. Fund it first, then: npm run balance\n`)
  process.exit(1)
}

console.log(`\n  Deploying ${name} from ${account.address}`)
console.log(`  Balance: ${formatEther(before)} MON`)

// Estimate rather than pad: on Monad an over-large gas limit is money burned.
const data = encodeDeployData({ abi, bytecode, args })
const estimate = await publicClient.estimateGas({ account: account.address, data })
const gas = (estimate * 102n) / 100n // +2%

console.log(`  Estimated gas: ${estimate}  ->  limit ${gas}`)

const hash = await wallet.deployContract({ abi, bytecode, args, gas, ...feeParams() })
console.log(`  tx ${hash}`)

const receipt = await publicClient.waitForTransactionReceipt({ hash })
const after = await publicClient.getBalance({ address: account.address })
const spent = before - after

if (receipt.status !== 'success') {
  console.error(`\n  Deploy REVERTED. Spent ${formatEther(spent)} MON anyway (billed on limit).\n`)
  process.exit(1)
}

console.log(`\n  ${name} deployed`)
console.log(`  address  ${receipt.contractAddress}`)
console.log(`  explorer ${addressUrl(receipt.contractAddress)}`)
console.log(`  tx       ${txUrl(hash)}`)

// --- The experiment ---------------------------------------------------------
const billedAtUsed = receipt.gasUsed * receipt.effectiveGasPrice
const billedAtLimit = gas * receipt.effectiveGasPrice
console.log(`\n  ── Gas billing ──`)
console.log(`  gas limit          ${gas}`)
console.log(`  gas used           ${receipt.gasUsed}`)
console.log(`  effective price    ${receipt.effectiveGasPrice} wei`)
console.log(`  actually spent     ${formatEther(spent)} MON`)
console.log(`  if billed on used  ${formatEther(billedAtUsed)} MON`)
console.log(`  if billed on limit ${formatEther(billedAtLimit)} MON`)
const closer = spent - billedAtUsed < billedAtLimit - spent ? 'USED' : 'LIMIT'
console.log(`  -> billed on ${closer}. Keep gas limits tight${closer === 'LIMIT' ? ' — every padded unit is real MON.' : '.'}`)

if (name === 'BidBlitz') {
  setEnv({ NEXT_PUBLIC_CONTRACT: receipt.contractAddress })
  console.log(`\n  Wrote NEXT_PUBLIC_CONTRACT to .env`)
}
console.log()
