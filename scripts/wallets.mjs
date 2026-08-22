/**
 * Generates the organizer wallet and the relayer pool, and writes them to .env.
 *
 * Private keys are written to .env and NEVER printed — only addresses are shown,
 * so nothing sensitive lands in a terminal transcript or a screen share.
 *
 * MASTER_KEY is never generated or overwritten: that is your own funded wallet
 * and you paste it into .env yourself.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { loadEnv, setEnv } from './lib/env.mjs'

const RELAYER_COUNT = 8

loadEnv()

const updates = {}
const report = []

if (!process.env.ORGANIZER_KEY) {
  const key = generatePrivateKey()
  updates.ORGANIZER_KEY = key
  report.push(['organizer (new)', privateKeyToAccount(key).address])
} else {
  report.push(['organizer', privateKeyToAccount(process.env.ORGANIZER_KEY).address])
}

if (!process.env.RELAYER_KEYS) {
  const keys = Array.from({ length: RELAYER_COUNT }, generatePrivateKey)
  updates.RELAYER_KEYS = keys.join(',')
  keys.forEach((k, i) => report.push([`relayer ${i} (new)`, privateKeyToAccount(k).address]))
} else {
  process.env.RELAYER_KEYS.split(',')
    .filter(Boolean)
    .forEach((k, i) => report.push([`relayer ${i}`, privateKeyToAccount(k.trim()).address]))
}

if (Object.keys(updates).length) setEnv(updates)

if (process.env.MASTER_KEY) {
  report.unshift(['MASTER', privateKeyToAccount(process.env.MASTER_KEY).address])
} else {
  report.unshift(['MASTER', '(not set — paste your funded key into .env as MASTER_KEY)'])
}

const pad = Math.max(...report.map(([label]) => label.length))
console.log()
for (const [label, address] of report) console.log(`  ${label.padEnd(pad)}  ${address}`)
console.log()
console.log(`  Keys written to .env (gitignored). They were not printed.`)
console.log(`  Fund the MASTER address above, then: npm run balance\n`)
