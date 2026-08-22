# BidBlitz

A live IPL-style auction where **every bid is a Monad transaction**. 70 people scan a QR,
type a name and a password, and bid against each other in real time on a shared big screen.
No wallet install, no extension, no seed phrase.

Built for Monad Blitz Hyderabad V3.

---

## Day-of runbook

### 0. Get MON first — this gates everything

```bash
npm run balance -- 0xYourAddress
```

**Target 8–10 MON.** Faucet drips (0.05–5 MON per address per 12–24h) will not get you
there in six hours, so:

1. **Message the Blitz organizers on Discord/Telegram** asking for testnet MON to a
   specific address. Only item here with multi-hour human latency — do it first.
2. Claim in parallel: [faucet.monad.xyz](https://faucet.monad.xyz),
   [Alchemy](https://www.alchemy.com/faucets/monad-testnet),
   [QuickNode](https://faucet.quicknode.com/monad/testnet),
   [ETHGlobal](https://ethglobal.com/faucet/monad-testnet-10143).

`npm run balance` prints a verdict and a cut-list for whatever number you actually have.

### 1. Wallets

```bash
cp .env.example .env
```

Paste your funded key into `.env` as `MASTER_KEY`, then:

```bash
npm run wallets
```

Generates the organizer wallet and 8 relayers. **Private keys are written to `.env` and
never printed** — only addresses appear, so nothing sensitive lands in a screen share.

### 2. Prove the pipeline before writing anything real

```bash
npm run compile && npm run deploy:ping
```

`Ping.sol` is five lines. If this fails, the problem is the toolchain — and you want to
learn that at T+0:30, not T+4:00. It also prints a gas-billing readout confirming
empirically that Monad charges on `gas_limit`, which is the number the whole budget rests on.

**Tripwire:** not deployed by T+1:00 → abandon solc-js, paste the contract into
[Remix](https://remix.ethereum.org), deploy via injected MetaMask, copy the address into `.env`.

### 3. Deploy the real thing

```bash
npm run deploy          # writes NEXT_PUBLIC_CONTRACT into .env
npm run fund-relayers   # master -> 8 relayers, run ONCE before doors
```

### 4. Drive it with bots

```bash
npm run bots
```

Eight bidders that join and bid on whatever lot is open. This is both your integration
test and your **Wi-Fi contingency** — they talk to the RPC directly, so if the venue
network dies the auction still resolves live on stage.

**Tripwire:** if `npm run bots` cannot produce a completed SOLD by T+2:30, cut the AI
agent, badge NFT, verification, and `contribute()`. Ship the auction loop only.

### 5. Run it

| Route | Who | What |
|---|---|---|
| `/` | the room | Join (name + password) then bid |
| `/screen` | projector | Big screen. Click START — it unlocks audio and goes fullscreen |
| `/admin` | you | Type a lot live, one-tap presets, SELL |

---

## Why it is built this way

Four Monad behaviours shaped nearly every decision:

**Gas is billed on `gas_limit`, not gas used — and reverted transactions still pay in full.**
So gas limits are hardcoded tight, never estimated at send time, and the client refuses to
submit a bid it already knows is stale. In a 70-person auction most bids lose the race, and
paying full price for each of those is what breaks the budget.

**A cold SLOAD costs 8,100 gas (vs 2,100 on Ethereum).** The auction's hot path is packed
into a single storage slot: `uint96 highestBid | uint40 endsAt | uint16 leadEntity | bool sold`.
`placeBid` touches two slots, not five.

**Reserve balance is computed from state 3 blocks back.** A wallet funded at block B had zero
balance at B−3, so its inflight gas budget is zero and its first bid is *silently excluded at
consensus* — no revert, no receipt. Hence the "Arming your wallet…" delay after funding, and
the 8-relayer pool instead of one hot wallet.

**`block.timestamp` has ~1s granularity** (3–4 blocks share one). So the countdown is anchored
to chain time once and interpolated locally — a chain-driven clock freezes then jumps, which
on a big screen reads as broken.

And one thing about rooms rather than chains: **70 phones behind venue Wi-Fi are one IP**, and
rate limits are per-IP. So all reads go through `/api/state` — one `eth_call`, CDN-cached,
fanned out over HTTP — and all writes go through `/api/send` with every transaction field
supplied explicitly. Chain load is constant no matter how many people are in the room.

## Brand

Uses Monad's official brand assets: mark path taken verbatim from
`monad.xyz/brand-page-assets/Logomark.svg`, purple `#6E54FF`, dark surface `#0E091C`, squad
colours from the official secondary palette. Note `#836EF9` — still on `docs.monad.xyz` and
most third-party material — is the **legacy** purple.

## Stack

Next.js 16 · viem · solc-js (no Foundry) · Upstash Redis (funding lock) · Vercel

## Safety

Burner keys are derived as `keccak256("bidblitz|" + salt + "|" + name + "|" + password)`.
The salt must ship to the browser, so it is public: anyone who knows a name and guesses the
password can derive that key. Fine for a testnet party game whose worst case is bidding from
someone's purse — **never reuse a real password**, and never reuse these keys for anything.
