/**
 * Eight bidders driving a room from this laptop.
 *
 * This is BOTH your integration test and your Wi-Fi contingency, which is why
 * it is a real script rather than a throwaway. If the venue network dies, the
 * auction still resolves live on stage from here.
 *
 *   npm run bots -- 0001       8 bots join room 0001 and bid on whatever opens
 *   npm run bots -- 0001 4     fewer bots
 *
 * They talk to the RPC directly, not through the web app — the scenario where
 * you need them is the one where the venue network is the problem.
 *
 * Names are deliberately human. The big screen should not advertise that these
 * are bots.
 */
import { formatEther, parseEther } from 'viem'
import { publicClient, walletFor, accountFor, fmt } from './lib/clients.mjs'
import { requireEnv, loadEnv } from './lib/env.mjs'
import { deriveKey } from '../src/lib/identity.mjs'
import { feeParams, GAS } from '../src/lib/chain.mjs'
import { BIDBLITZ_ABI } from '../src/lib/abi.mjs'
import { MON } from '../src/lib/format.mjs'
import { roomIdFromCode, roomCode } from '../src/lib/room.mjs'

loadEnv()

const CONTRACT = requireEnv('NEXT_PUBLIC_CONTRACT')
const masterKey = requireEnv('MASTER_KEY')
const SALT = process.env.NEXT_PUBLIC_EVENT_SALT || 'bidblitz-hyd-v3'
const BOT_PASSWORD = 'bot-' + SALT

const NAMES = ['Aditya', 'Priya', 'Rohan', 'Sneha', 'Karthik', 'Ananya', 'Vikram', 'Meera']

const ROOM = roomIdFromCode(process.argv[2])
if (!ROOM) {
  console.error('')
  console.error('  Usage: npm run bots -- <ROOMCODE> [count]')
  console.error('  The code is the four characters shown on the room screen.')
  console.error('')
  process.exit(1)
}

const count = Math.min(Number(process.argv[3]) || 8, NAMES.length)
const FUND = parseEther('0.05')

// Personality: how aggressive, and how long they wait before jumping in.
const bots = NAMES.slice(0, count).map((name, i) => {
  const key = deriveKey(name, BOT_PASSWORD, SALT)
  return {
    name,
    key,
    account: accountFor(key),
    wallet: walletFor(key),
    nonce: 0,
    entityId: 0,
    aggression: 0.35 + (i % 4) * 0.18, // chance of bidding on any given tick
    patience: 400 + i * 220,           // ms between considering a bid
    lastAct: 0,
  }
})

console.log(`\n  ${count} bidders joining room ${roomCode(ROOM)}\n`)

// --- fund ---------------------------------------------------------------------
const master = accountFor(masterKey)
const masterWallet = walletFor(masterKey)
let masterNonce = await publicClient.getTransactionCount({
  address: master.address,
  blockTag: 'latest',
})

for (const bot of bots) {
  const balance = await publicClient.getBalance({ address: bot.account.address })
  if (balance < parseEther('0.02')) {
    const hash = await masterWallet.sendTransaction({
      to: bot.account.address,
      value: FUND,
      gas: GAS.transfer,
      nonce: masterNonce++,
      ...feeParams(),
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${bot.name.padEnd(9)} funded ${formatEther(FUND)} MON`)
  } else {
    console.log(`  ${bot.name.padEnd(9)} has ${fmt(balance)}`)
  }
}

// A wallet funded at block B had zero balance at B-3, and Monad computes the
// inflight gas budget from that lagged state — so a bid sent immediately is
// excluded at consensus, silently. Wait it out before anyone acts.
console.log(`\n  arming (4 blocks)…`)
const startBlock = await publicClient.getBlockNumber()
while ((await publicClient.getBlockNumber()) < startBlock + 4n) {
  await new Promise((r) => setTimeout(r, 200))
}

// --- join ---------------------------------------------------------------------
for (const bot of bots) {
  bot.nonce = await publicClient.getTransactionCount({
    address: bot.account.address,
    blockTag: 'latest',
  })

  const [entityId] = await publicClient.readContract({
    address: CONTRACT,
    abi: BIDBLITZ_ABI,
    functionName: 'purseOf',
    args: [ROOM, bot.account.address],
  })

  if (Number(entityId) === 0) {
    const squad = (parseInt(bot.account.address.slice(-1), 16) % 4) + 1
    try {
      await bot.wallet.writeContract({
        address: CONTRACT,
        abi: BIDBLITZ_ABI,
        functionName: 'joinSquad',
        args: [ROOM, squad],
        gas: GAS.joinSquad,
        nonce: bot.nonce++,
        ...feeParams(),
      })
      bot.entityId = squad
      console.log(`  ${bot.name.padEnd(9)} joined squad ${squad}`)
    } catch (err) {
      console.log(`  ${bot.name.padEnd(9)} join failed: ${err.shortMessage || err.message}`)
    }
  } else {
    bot.entityId = Number(entityId)
    console.log(`  ${bot.name.padEnd(9)} already in entity ${entityId}`)
  }
}

// --- bid loop -----------------------------------------------------------------
console.log(`\n  watching for open lots — ctrl-c to stop\n`)

let lastLot = 0
let bidCount = 0

while (true) {
  let s
  try {
    s = await publicClient.readContract({
      address: CONTRACT,
      abi: BIDBLITZ_ABI,
      functionName: 'state',
      args: [ROOM],
    })
  } catch {
    await new Promise((r) => setTimeout(r, 800))
    continue
  }

  const lotId = Number(s.openLotId)
  const highest = s.highestBid
  const endsAt = Number(s.endsAt)
  const now = Math.floor(Date.now() / 1000)

  if (lotId === 0 || now >= endsAt) {
    await new Promise((r) => setTimeout(r, 500))
    continue
  }

  if (lotId !== lastLot) {
    lastLot = lotId
    console.log(`\n  LOT #${lotId}  ${s.lname}`)
    for (const b of bots) {
      b.nonce = await publicClient.getTransactionCount({
        address: b.account.address,
        blockTag: 'latest',
      })
    }
  }

  const t = Date.now()
  for (const bot of bots) {
    if (t - bot.lastAct < bot.patience) continue
    if (Math.random() > bot.aggression) continue
    if (Number(s.leadEntity) === bot.entityId) continue // don't outbid yourself

    bot.lastAct = t
    const step = (BigInt(5 + Math.floor(Math.random() * 20)) * MON) / 10n
    const amount = highest + step

    const [, purse] = await publicClient
      .readContract({
        address: CONTRACT,
        abi: BIDBLITZ_ABI,
        functionName: 'purseOf',
        args: [ROOM, bot.account.address],
      })
      .catch(() => [0, 0n])

    if (amount > purse) continue

    try {
      await bot.wallet.writeContract({
        address: CONTRACT,
        abi: BIDBLITZ_ABI,
        functionName: 'placeBid',
        args: [ROOM, lotId, amount],
        gas: GAS.placeBid,
        nonce: bot.nonce++,
        ...feeParams(),
      })
      bidCount++
      console.log(
        `  ${bot.name.padEnd(9)} bid ${(Number(amount) / 1e18).toFixed(2)} MON   (${bidCount} total)`,
      )
    } catch {
      // Losing the race is normal and expected — someone else got there first.
      bot.nonce = await publicClient.getTransactionCount({
        address: bot.account.address,
        blockTag: 'latest',
      })
    }
    break // one bid per tick keeps it watchable and keeps gas spend sane
  }

  await new Promise((r) => setTimeout(r, 350))
}
