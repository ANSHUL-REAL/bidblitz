'use client'
import { MON, SQUADS } from './format.mjs'
import { FANTASY_ITEMS } from './categories.mjs'

/**
 * A complete auction, simulated in the browser — no chain, no wallet, no server.
 *
 * It exists so the product is fully playable and testable before the contract
 * is deployed: host an event, queue items, run lots, watch bots bid, sell, and
 * see the leaderboard. The on-chain version mirrors these exact actions
 * (createRoom → startLot → placeBid → sellLot), so what you approve here is what
 * ships.
 *
 * Amounts are wei BigInts so the same formatAmount()/RaceTrack render path is
 * reused unchanged.
 */

const BOT_NAMES = ['Aditya', 'Priya', 'Rohan', 'Sneha', 'Karthik', 'Ananya', 'Vikram', 'Meera']
const START_PURSE = 100n * MON
const MIN_STEP = MON / 2n // 0.5 MON

const uid = (() => { let n = 0; return () => `d${++n}` })()

/** Solo / meme auction: you + individual bot bidders, each with their own purse. */
function soloState() {
  return {
    roomName: 'Demo Auction',
    mode: 0,
    you: { id: 'you', name: 'You', color: '#6b2de6', avatarSeed: 'Rex', purse: START_PURSE, spent: 0n, wins: 0, bids: 0 },
    bots: BOT_NAMES.slice(0, 6).map((name, i) => ({
      id: `bot${i}`,
      name,
      color: null,
      purse: START_PURSE,
      spent: 0n,
      wins: 0,
      bids: 0,
      aggression: 0.3 + (i % 4) * 0.18,
      patience: 500 + i * 250,
      ceiling: 20n * MON + BigInt(i) * 4n * MON,
      lastAct: 0,
    })),
    queue: [],
    lots: [],
    openLotId: null,
    now: Date.now(),
  }
}

/**
 * Fantasy League: four teams share a purse and draft players. "You" ARE a team
 * (the first squad); the other three are bot-run. Same auction machinery — the
 * bidding entity is just a team instead of a person. Players are preloaded so
 * the draft can start immediately.
 */
function squadsState() {
  const [mine, ...rest] = SQUADS
  return {
    roomName: 'Fantasy League',
    mode: 1,
    you: { id: 'you', name: mine.name, color: mine.color, short: mine.short, ink: mine.ink, purse: 200n * MON, spent: 0n, wins: 0, bids: 0 },
    bots: rest.map((tm, i) => ({
      id: `team${tm.id}`,
      name: tm.name,
      color: tm.color,
      short: tm.short,
      ink: tm.ink,
      purse: 200n * MON,
      spent: 0n,
      wins: 0,
      bids: 0,
      aggression: 0.45 + i * 0.12,
      patience: 550 + i * 220,
      ceiling: 70n * MON + BigInt(i) * 12n * MON,
      lastAct: 0,
    })),
    queue: FANTASY_ITEMS.map((p) => ({ id: uid(), name: p.name, image: '' })),
    lots: [],
    openLotId: null,
    now: Date.now(),
  }
}

export class DemoEngine {
  constructor(mode = 'solo') {
    this.mode = mode === 'squads' ? 'squads' : 'solo'
    this.state = this.mode === 'squads' ? squadsState() : soloState()
    this.subs = new Set()
    this.timer = null
    this.ai = false          // AI bidders via /api/agent (OpenRouter)
    this.aiReason = null     // last { name, text } to show on screen
    this.lastAI = 0
    this.aiIdx = 0
  }

  /** Turn AI bidders on/off. Falls back to heuristic bots if there is no key. */
  setAI(on) { this.ai = !!on; if (!on) this.aiReason = null; this.emit() }

  subscribe(cb) {
    this.subs.add(cb)
    cb(this.snapshot())
    return () => this.subs.delete(cb)
  }

  emit() {
    const snap = this.snapshot()
    for (const cb of this.subs) cb(snap)
  }

  /** Immutable-ish copy for React consumers. */
  snapshot() {
    const s = this.state
    const openLot = s.lots.find((l) => l.id === s.openLotId) || null
    const bidders = [s.you, ...s.bots]
    return {
      roomName: s.roomName,
      mode: s.mode,
      you: { ...s.you },
      bidders: bidders.map((b) => ({ id: b.id, name: b.name, color: b.color, short: b.short, ink: b.ink, avatarSeed: b.avatarSeed, purse: b.purse, spent: b.spent, wins: b.wins, bids: b.bids })),
      queue: s.queue.map((q) => ({ ...q })),
      lots: s.lots.map((l) => ({ ...l })),
      openLot: openLot ? { ...openLot } : null,
      aiReason: this.aiReason,
      now: Date.now(),
    }
  }

  nameFor(id) {
    if (id === 'you') return this.state.you.name
    return this.state.bots.find((b) => b.id === id)?.name || '—'
  }
  bidderById(id) {
    if (id === 'you') return this.state.you
    return this.state.bots.find((b) => b.id === id)
  }

  // ------------------------------------------------------------- host actions

  setYouAvatar(seed) {
    this.state.you.avatarSeed = seed
    this.emit()
  }

  setRoom({ name, mode }) {
    if (name != null) this.state.roomName = name
    if (mode != null) this.state.mode = mode
    this.emit()
  }

  queueItem(name, image = '') {
    if (!name?.trim()) return
    this.state.queue.push({ id: uid(), name: name.trim().slice(0, 60), image })
    this.emit()
  }

  removeQueued(id) {
    this.state.queue = this.state.queue.filter((q) => q.id !== id)
    this.emit()
  }

  /** Start the next queued item (or a passed-in one) as a live lot. */
  startLot(durationSec = 20, item = null) {
    if (this.state.openLotId) return { error: 'Sell the current lot first' }
    const next = item || this.state.queue.shift()
    if (!next) return { error: 'Nothing queued' }

    const lot = {
      id: uid(),
      name: next.name,
      image: next.image || '',
      status: 'live',
      endsAt: Date.now() + durationSec * 1000,
      duration: durationSec,
      highestBid: 0n,
      leadId: null,
      bids: {},   // bidderId -> their best bid on this lot (for the race track)
    }
    this.state.lots.push(lot)
    this.state.openLotId = lot.id
    this.emit()
    return { ok: true }
  }

  sellLot() {
    const lot = this.state.lots.find((l) => l.id === this.state.openLotId)
    if (!lot) return
    lot.status = lot.leadId ? 'sold' : 'unsold'
    if (lot.leadId) {
      const w = this.bidderById(lot.leadId)
      if (w) {
        const amt = lot.highestBid > w.purse ? w.purse : lot.highestBid
        w.purse -= amt
        w.spent += amt
        w.wins += 1
        lot.winnerId = lot.leadId
        lot.soldFor = lot.highestBid
      }
    }
    this.state.openLotId = null
    this.emit()
  }

  closeLot() {
    const lot = this.state.lots.find((l) => l.id === this.state.openLotId)
    if (lot) lot.status = 'unsold'
    this.state.openLotId = null
    this.emit()
  }

  // -------------------------------------------------------------- bid actions

  placeBid(bidderId, amount) {
    const lot = this.state.lots.find((l) => l.id === this.state.openLotId)
    if (!lot || lot.status !== 'live') return { error: 'No live lot' }
    if (Date.now() >= lot.endsAt) return { error: 'Lot ended' }
    if (amount <= lot.highestBid) return { error: 'Bid too low' }
    const b = this.bidderById(bidderId)
    if (!b) return { error: 'Unknown bidder' }
    if (amount > b.purse) return { error: 'Not enough purse' }

    lot.highestBid = amount
    lot.leadId = bidderId
    lot.bids[bidderId] = amount
    b.bids += 1

    // The clock only counts down — a bid never adds time.
    this.emit()
    return { ok: true }
  }

  // ------------------------------------------------------------- bot autoplay

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 250)
  }
  stop() {
    clearInterval(this.timer)
    this.timer = null
  }

  tick() {
    const lot = this.state.lots.find((l) => l.id === this.state.openLotId)
    // Emit a heartbeat so countdowns move even with no bids.
    if (!lot || lot.status !== 'live') { this.emit(); return }
    if (Date.now() >= lot.endsAt) { this.emit(); return }

    // AI bidders: fire a model decision every ~2.2s when enabled. Runs alongside
    // the heuristic bots below (which guarantee cadence), and no-ops on fallback.
    if (this.ai && Date.now() - this.lastAI > 2200) {
      this.lastAI = Date.now()
      this.aiTurn(lot)
    }

    const t = Date.now()
    for (const bot of this.state.bots) {
      if (t - bot.lastAct < bot.patience) continue
      if (Math.random() > bot.aggression) continue
      if (lot.leadId === bot.id) continue // don't outbid yourself
      const step = MIN_STEP + BigInt(Math.floor(Math.random() * 4)) * MIN_STEP
      const amount = lot.highestBid + step
      if (amount > bot.ceiling || amount > bot.purse) continue
      bot.lastAct = t
      this.placeBid(bot.id, amount)
      return // one bot bid per tick keeps it watchable
    }
    this.emit()
  }

  /**
   * One AI decision for the next eligible bot, via /api/agent (OpenRouter). On a
   * fallback/timeout it does nothing and the heuristic bots carry the round; on
   * a real answer it bids (or passes) and surfaces the model's reasoning.
   */
  async aiTurn(lot) {
    try {
      const bots = this.state.bots
      let bot = null
      for (let i = 0; i < bots.length; i++) {
        const cand = bots[(this.aiIdx + i) % bots.length]
        if (lot.leadId !== cand.id && cand.purse > lot.highestBid) {
          bot = cand; this.aiIdx = (this.aiIdx + i + 1) % bots.length; break
        }
      }
      if (!bot) return

      const toMon = (w) => Number(w) / 1e18
      const timeLeft = Math.max(0, (lot.endsAt - Date.now()) / 1000)
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item: lot.name, currentBid: toMon(lot.highestBid), budget: toMon(bot.purse),
          persona: bot.name, timeLeft, minStep: toMon(MIN_STEP),
        }),
      }).then((r) => r.json()).catch(() => null)

      if (!res || res.action === 'fallback') return
      const cur = this.state.lots.find((l) => l.id === lot.id)
      if (!cur || cur.status !== 'live' || Date.now() >= cur.endsAt) return

      if (res.action === 'pass') {
        this.aiReason = { name: bot.name, text: res.reasoning || 'Holding back on this one.' }
        this.emit(); return
      }
      let amount = BigInt(Math.max(0, Math.round(Number(res.amount) * 1000))) * (MON / 1000n)
      if (amount <= cur.highestBid) amount = cur.highestBid + MIN_STEP
      if (amount > bot.purse) {
        this.aiReason = { name: bot.name, text: res.reasoning || 'Out of budget — passing.' }
        this.emit(); return
      }
      this.aiReason = { name: bot.name, text: res.reasoning || 'Going higher.' }
      this.placeBid(bot.id, amount)
    } catch { /* never let the AI break the demo */ }
  }
}
