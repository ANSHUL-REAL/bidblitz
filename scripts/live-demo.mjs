/**
 * Spin up a LIVE room on the deployed contract: a host opens a lot and a few
 * bidders place escalating bids, then the lot stays open so you can watch the
 * big screen + history update in real time. Proves the end-to-end pipeline.
 *   node scripts/live-demo.mjs
 */
import { parseEther } from 'viem'
import { publicClient, walletFor, accountFor, fmt } from './lib/clients.mjs'
import { requireEnv } from './lib/env.mjs'
import { BIDBLITZ_ABI } from '../src/lib/abi.mjs'
import { GAS, feeParams, txUrl } from '../src/lib/chain.mjs'
import { roomCode } from '../src/lib/room.mjs'

const C = requireEnv('NEXT_PUBLIC_CONTRACT')
const keys = requireEnv('RELAYER_KEYS').split(',').map((s) => s.trim()).filter(Boolean)
const host = walletFor(keys[0])
const bidders = keys.slice(1, 4).map((k) => ({ w: walletFor(k), addr: accountFor(k).address }))
const APP = 'https://bidblitz-anshul-reals-projects.vercel.app'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const send = async (label, wallet, fn, args, gas, value = 0n) => {
  const hash = await wallet.writeContract({ address: C, abi: BIDBLITZ_ABI, functionName: fn, args, gas, value, ...feeParams() })
  const r = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`  ${label}: ${r.status}`)
  return hash
}
const read = (fn, a) => publicClient.readContract({ address: C, abi: BIDBLITZ_ABI, functionName: fn, args: a })

console.log('\n  Creating a live demo room…')
await send('createRoom', host, 'createRoom', ['LIVE DEMO', 0, false], GAS.createRoom)
const roomId = Number(await read('roomCount', []))
const code = roomCode(roomId)
console.log(`  -> room ${code}\n  Open the big screen NOW: ${APP}/r/${code}/screen\n`)

await send('startLot(300s)', host, 'startLot', [roomId, 'Doge', '', 300], GAS.startLot)
const s = await read('state', [roomId])
const lotId = Number(s.openLotId || 1)

for (const b of bidders) await send('join', b.w, 'joinSolo', [roomId], GAS.joinSolo)

console.log('\n  Bidding live (watch the screen)…')
let bid = 1
for (let round = 0; round < 4; round++) {
  for (const b of bidders) {
    await send(`bid ${bid} by ${b.addr.slice(0, 6)}`, b.w, 'placeBid', [roomId, lotId, parseEther(String(bid))], GAS.placeBid)
    bid += 1
    await sleep(2500)
  }
}
console.log(`\n  Lot stays open ~4 more min. Watch it live:`)
console.log(`   screen   ${APP}/r/${code}/screen`)
console.log(`   history  ${APP}/r/${code}/history`)
console.log(`   bid page ${APP}/r/${code}\n`)
