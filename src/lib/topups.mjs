import { keccak256, toHex, parseEther } from 'viem'

/**
 * Buying points in a FREE room.
 *
 * Points are a game score, not a currency. This is ordinary free-to-play
 * monetisation — you pay real MON, you get more paddle — and the rules that
 * keep it that way are deliberate, not decoration:
 *
 *  - ONE WAY, always. Points can never be converted back to MON. A two-way
 *    conversion would make this a money transmitter rather than a game, which
 *    is a completely different (and licensed) business.
 *  - FREE ROOMS ONLY. Free rooms award points and bragging rights, nothing of
 *    real value. Selling bidding power toward a real prize is a raffle in a lot
 *    of jurisdictions; selling it toward a leaderboard is a video game. See
 *    the guard in /api/free/topup.
 *  - No refunds are possible, so the UI has to say so before the wallet opens.
 *
 * MON rooms have no packs and never will: there you bid your own real MON
 * directly, which is already the honest version of paying to win.
 */

/** Where players' MON actually goes. Never hardcoded — set it in .env. */
export const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || ''
export const hasTreasury = /^0x[0-9a-fA-F]{40}$/.test(TREASURY)

/**
 * The shop. Bigger packs carry a bonus, which is why `points` is not just
 * `mon * 50` — it is the whole reason anyone buys the 20 over twenty 1s.
 *
 * Base purse is 50 points (START_PURSE_MILLI), so the 1 MON pack doubles a
 * player and the 20 MON pack is a different game entirely. That is the
 * "pay to win" the packs are for; if it ever hollows out rooms, cap what a
 * single lot can absorb rather than nerfing the packs.
 */
export const PACKS = [
  { id: 1,  mon: '1',  points: 50,   bonus: 0  },
  { id: 5,  mon: '5',  points: 275,  bonus: 10 },
  { id: 10, mon: '10', points: 600,  bonus: 20 },
  { id: 20, mon: '20', points: 1300, bonus: 30 },
]

export const packById = (id) => PACKS.find((p) => p.id === Number(id)) || null

/** Exact wei a pack must be paid in. Compared strictly server-side. */
export const packWei = (pack) => parseEther(pack.mon)

/** Find the pack a payment's value matches exactly, or null. */
export const packForWei = (wei) => {
  const v = BigInt(wei ?? 0n)
  return PACKS.find((p) => packWei(p) === v) || null
}

/**
 * The memo carried in the payment's calldata.
 *
 * This is what stops one player claiming another's payment. Without it the
 * server only knows "somebody paid the treasury", and whoever posted the tx
 * hash first would get the points. Binding the hash to (room, player) at
 * signing time makes the payer the only person it can credit.
 *
 * 32 bytes, so the calldata cost is fixed and tiny.
 */
export const topupMemo = (code, playerId) =>
  keccak256(toHex(`bidblitz-topup|${String(code).toUpperCase()}|${String(playerId).toLowerCase()}`))

/** Plain transfer + 32 bytes of memo: 21000 + 32*16, with headroom. */
export const TOPUP_GAS = 26_000n

/** Confirmations to wait before crediting. Monad finalises in ~600ms, so this
 *  costs the buyer about a second and removes any reorg question. */
export const TOPUP_CONFIRMATIONS = 3n
