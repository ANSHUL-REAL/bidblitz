/**
 * The shape /api/free/state actually returns.
 *
 * This file exists because every bug in free mode so far lived on this exact
 * seam, not inside any one function: the host console read `state.duration`
 * before the API sent it, a component called `session.refresh` that was never
 * defined, and `unit` was threaded into the bid bar but not into the race track
 * beside it — so a free room briefly labelled its points "MON".
 *
 * None of those are JavaScript being unreliable. They are an untyped contract
 * between a route and the six components reading it. Typing the contract is
 * what catches them; typing the internals of a 40-line component is not.
 *
 * Amounts are 18-decimal wei STRINGS, deliberately. The store works in
 * milli-points (a bigint), the wire cannot carry a bigint through JSON, and the
 * UI renders wei via formatAmount — so the string is the honest middle. Do not
 * "simplify" these to numbers: 50 points is 5e19 wei, well past 2^53.
 */

/** 18-decimal fixed-point, base-10, as a string. */
export type WeiString = string

/** 0 = solo auction, 1 = fantasy squads. Mirrors the contract's MODE_*. */
export type RoomMode = 0 | 1

export interface FreePlayer {
  /** Address-SHAPED (0x + 40 hex) but not a wallet: no key, never on a chain. */
  addr: string
  entityId: number
  name: string | null
  avatarSeed: string | null
  squad: number | null
  purse: WeiString
  spent: WeiString
  wins: number
}

export interface FreeRacer {
  bidder: string
  entityId: number
  amount: WeiString
  bids: number
}

export interface FreeBid {
  bidder: string
  name: string | null
  entityId: number
  amount: WeiString
  at: string
}

export interface FreeState {
  free: true
  /** Never "MON" in a free room. The UI reads this to label amounts. */
  unit: 'PTS'
  escrow: false
  exists: true
  code: string
  /** Components key off this; for free rooms the code IS the id. */
  roomId: string
  rname: string
  host: string | null
  mode: RoomMode
  categories: string[]
  closed: boolean

  openLotId: number
  totalLots: number
  lotId: number
  lname: string
  limage: string
  highestBid: WeiString
  /** Unix SECONDS, comparable against chainNow. */
  endsAt: number
  /** Seconds the lot was given — the denominator for a progress bar. */
  duration: number
  leadEntity: number
  bidder: string | null
  sold: boolean

  nEntities: number
  squadPurses: WeiString[]
  /** SERVER clock in unix seconds. Countdowns anchor here, never Date.now(). */
  chainNow: number
  racers: FreeRacer[]
  /** Present only on ?full=1 (the host console). Phones omit it. */
  bids?: FreeBid[]
  players: FreePlayer[]
  /** Client clock in MILLISECONDS when the payload arrived. */
  fetchedAt: number
  stale?: boolean
}

/** One room in a logged-in player's saved history. */
export interface FreeHistoryEntry {
  code: string
  title: string
  playedAt: string
  closed: boolean
  wins: number
  spent: WeiString
  purse: WeiString
  bought: WeiString
  lots: number
  players: number
  /** True when this account RAN the room rather than played in it. */
  hosted: boolean
}

export interface FreeHistoryResponse {
  history: FreeHistoryEntry[]
  totals: {
    rooms: number
    wins: number
    spent: WeiString
  }
}
