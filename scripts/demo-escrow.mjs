/**
 * End-to-end REAL-MON auction: create an escrow room, open a lot, a bidder
 * escrows a real bid, the host sells and withdraws the proceeds to their wallet.
 * Prints every tx's explorer link so you can watch the payment land.
 *   node scripts/demo-escrow.mjs
 */
import { parseEther } from 'viem'
import { publicClient, walletFor, accountFor, fmt } from './lib/clients.mjs'
import { requireEnv } from './lib/env.mjs'
import { BIDBLITZ_ABI } from '../src/lib/abi.mjs'
import { GAS, feeParams, txUrl, addressUrl } from '../src/lib/chain.mjs'
import { roomCode } from '../src/lib/room.mjs'

const CONTRACT = requireEnv('NEXT_PUBLIC_CONTRACT')
const hostW = walletFor(requireEnv('MASTER_KEY'))
const hostAddr = accountFor(requireEnv('MASTER_KEY')).address
const bidderKey = requireEnv('RELAYER_KEYS').split(',').map((s) => s.trim()).filter(Boolean)[0]
const bidW = walletFor(bidderKey)
const bidAddr = accountFor(bidderKey).address
const BID = parseEther('0.5')

const send = async (label, wallet, fn, args, gas, value = 0n) => {
  const hash = await wallet.writeContract({ address: CONTRACT, abi: BIDBLITZ_ABI, functionName: fn, args, gas, value, ...feeParams() })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`  ${label}\n    ${txUrl(hash)}`)
  return hash
}
const read = (fn, args) => publicClient.readContract({ address: CONTRACT, abi: BIDBLITZ_ABI, functionName: fn, args })

console.log(`\n  Host   ${hostAddr}\n  Bidder ${bidAddr}\n`)
const hostBefore = await publicClient.getBalance({ address: hostAddr })

console.log('  1. createRoom (REAL payout / escrow)')
await send('createRoom', hostW, 'createRoom', ['Real Payout Test', 0, true], GAS.createRoom)
const roomId = Number(await read('roomCount', []))
const code = roomCode(roomId)
console.log(`     -> room #${roomId}, code ${code}`)

console.log('  2. startLot "Golden Gavel"')
await send('startLot', hostW, 'startLot', [roomId, 'Golden Gavel', '', 180], GAS.startLot)
const s = await read('state', [roomId])
const lotId = Number(s.openLotId || s.lotId || 1)

console.log('  3. bidder joinSolo')
await send('joinSolo', bidW, 'joinSolo', [roomId], GAS.joinSolo)

console.log(`  4. bidder placeBid ${fmt(BID)} (escrows real MON)`)
await send('placeBid', bidW, 'placeBid', [roomId, lotId, BID], GAS.placeBid, BID)

console.log('  5. host sellLot (credits the host)')
await send('sellLot', hostW, 'sellLot', [roomId, lotId], GAS.sellLot)
console.log(`     host owed: ${fmt(await read('pendingWithdrawals', [hostAddr]))}`)

console.log('  6. host withdraw (MON -> host wallet)')
await send('withdraw', hostW, 'withdraw', [], GAS.withdraw)

const hostAfter = await publicClient.getBalance({ address: hostAddr })
console.log(`\n  host balance: ${fmt(hostBefore)} -> ${fmt(hostAfter)} (received the 0.5 bid, minus gas)`)
console.log(`\n  Watch it live:`)
console.log(`   history  https://bidblitz-anshul-reals-projects.vercel.app/r/${code}/history`)
console.log(`   contract ${addressUrl(CONTRACT)}`)
console.log(`   host     ${addressUrl(hostAddr)}\n`)
