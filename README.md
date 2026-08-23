# BidBlitz

**Live room-wide auctions.** Anyone hosts a room, shares a four-character code or a QR, and
the whole room bids in real time on a shared big screen.

Two ways to run one, and the difference is the first thing you're asked:

- **Free** — off-chain, for fun. No wallet, no MON, no gas, for the host or anyone joining.
- **MON** — every bid is a Monad transaction, and everyone spends **their own** MON.

BidBlitz never pays for anybody's gas. It holds no treasury and no server-side wallet.

- 🌐 **Live app:** https://bidblitz-anshul-reals-projects.vercel.app
- 🔗 **Contract (Monad testnet):** [`0x094a2bee94586c1a74d44ff69cc5c72ca87f1d07`](https://testnet.monadvision.com/address/0x094a2bee94586c1a74d44ff69cc5c72ca87f1d07)
- ⛓ **Chain:** Monad testnet (chain id `10143`)

---

## What it is

### Free rooms — `/f/<code>`

Off-chain and free to play. Bids are points, not currency; nothing is written to a chain. Join
by picking a name and a face — no wallet, no account, ~10 seconds. Everyone starts on an equal
purse.

Free rooms are off-chain **because** they're free: on Monad even a play-money bid is a
transaction, so "free" and "on-chain" can't both be true — somebody would have to pay the gas.
State lives in Postgres and every rule (who's leading, who may settle) is enforced there.

**Point packs (optional).** Players can buy extra points with real MON, paid to the address in
`NEXT_PUBLIC_TREASURY_ADDRESS`. This is how the project pays for itself. Two rules make it a
game purchase rather than a financial product, and both are enforced in code:

- **One way.** Points can never be converted back to MON. A two-way conversion would make this
  money transmission, which is a licensed business.
- **Free rooms only.** Free rooms award points and bragging rights — nothing of real value.
  Selling bidding power toward a *real prize* looks like a raffle in many jurisdictions;
  selling it toward a leaderboard is a video game. `/api/free/topup` refuses any room that
  isn't in the free tables.

Payment is verified against the chain, never trusted from the client: `/api/free/topup` re-reads
the transaction and checks it was mined and succeeded, went to the treasury, paid a pack price
exactly, is buried under 3 confirmations, and carries a memo binding it to that specific
(room, player). The memo is what stops somebody watching the chain and claiming a payment that
isn't theirs. `free_topups.tx_hash` is a primary key, so a replay credits nothing.

Leave `NEXT_PUBLIC_TREASURY_ADDRESS` blank and packs disappear entirely.

### MON rooms — `/r/<code>`

Every bid is a real transaction on Monad testnet, and each participant brings their own MON:

- **Real payout.** Bids are real MON **escrowed on-chain**. On SELL the winning bid is **paid
  to the host** and outbid bidders are **refunded**. Both produce a transaction you can show.
- **On-chain play money.** Bids are just a score and no MON moves — but every bid is still a
  transaction, so bidders pay gas. Worth it for the permanent record and the winner badge;
  otherwise host a Free room.

Joining a MON room means connecting a wallet (MetaMask/Rabby/OKX/Backpack). If it is short of
gas, BidBlitz shows the address and a faucet link and waits — it does not, and cannot, fund it.

### Either kind

- **Fantasy League.** A four-team draft; everyone who joins is drafted onto a squad.
- **Play Solo / Demo.** A practice auction against bots — no room, no wallet. Toggle **AI
  bidders** to have the bots decide via an LLM (OpenRouter) and show their reasoning.

## How to host (60 seconds)

1. Open **`/host`**, choose **Free** or **MON**, name the auction, pick categories, and
   **Create**. A free room is created instantly; a MON room is an on-chain `createRoom` tx
   signed by your wallet. You get a room **code**.
2. Put **`/f/<code>/screen`** (or `/r/<code>/screen`) on a projector — it shows a **QR + the
   code**.
3. People **scan → join**, pick an avatar, and get a giant **BID** button.
4. In **`/r/<code>/host`** start a lot (one-tap items from your categories, upload a photo,
   or paste a URL) on a timer, then **SELL** to the top bid → full-screen **SOLD** takeover.
5. Real-payout rooms: **Collect** your proceeds in the host console; outbid bidders **Claim
   refund** in the room. Both produce a transaction you can show.

## Where to see the payments / on-chain transactions

Everything is verifiable — you never have to trust the app's UI:

- **In-app live history:** `/r/<code>/history` streams the whole room's ledger straight from
  the chain — every **bid, sale, refund, and host withdrawal** — and each row links to the
  real Monad transaction. Open to host and bidders alike; updates every ~2.5s.
- **The SOLD screen** shows the winner, the amount, and an explorer link.
- **After each bid**, the "view tx ↗" link opens that exact transaction.
- **Collect / Claim refund** show the `withdraw()` tx — proof the MON reached the wallet.
- **On the block explorer** (source of truth):
  - All room activity: open the [contract address](https://testnet.monadvision.com/address/0x094a2bee94586c1a74d44ff69cc5c72ca87f1d07)
    → every `createRoom`, `placeBid`, `LotSold`, `Refunded`, `Withdrawn` event is there.
  - A specific payment: open the tx hash → see the MON `value` move. For a **real-payout**
    sale, the host's `withdraw()` tx shows MON leaving the contract into the host wallet —
    that is the payment. The host wallet's balance on the explorer confirms it arrived.

> Play-money rooms move no MON (only gas is real). Real-payout rooms move real testnet MON —
> which has no cash value, but the transfers are genuinely on-chain.

## Why Monad

The format only works because Monad settles in well under a second, and a few specifics
shaped the whole build:

- **Sub-second finality (300ms blocks / 600ms finality)** — a 20-second lot can't wait for a
  slow confirmation. Speed is the mechanic.
- **Gas is billed on `gas_limit`, not gas used** — and reverted txs still pay in full. So gas
  limits are hardcoded tight and the client won't submit a bid it knows is stale.
- **Cold SLOAD costs 8,100 gas** — the auction hot path is packed into a single storage slot
  so `placeBid` touches two slots, not five.
- **Reserve balance is computed from state 3 blocks back** — a wallet that just received MON
  had a zero balance at B-3, so its first bid would be silently excluded at consensus, with no
  revert and no receipt. The client waits ~4 blocks ("arming") after it sees funds land.

## Real-MON escrow, safely

Escrow rooms hold real value, so the contract uses a **pull-payment** design: `placeBid`
escrows exactly the bid; an outbid bidder is credited to `pendingWithdrawals`; on sale the
winning bid is credited to the host; everyone pulls with `withdraw()`. The settlement path
makes **no external call**, so there's no reentrancy surface, and a permissionless
`finalize()` lets the winner (or anyone) settle an expired lot so escrowed MON can never be
trapped by an absent host. Audited before deploy (see git history).

## Architecture

```
MON rooms (/r/<code>)
  Phones (own wallet) ── signed tx ──▶ /api/send ──▶ RPC (fallback list)
  /api/state   ONE cached chain read  ◀── every phone @1Hz + big screen @400ms
  /api/history chain-derived feed     ◀── the live transaction ledger

FREE rooms (/f/<code>)
  Phones ──▶ /api/free/bid ──▶ Postgres  (one conditional UPDATE decides the race)
  /api/free/state  ONE cached query      ◀── every phone @900ms + screen @400ms

Supabase   free-room state · room categories · item roster · avatars · host accounts

No server-side wallet anywhere. Nothing here can spend a participant's MON.
```

A whole room on one venue Wi-Fi is a single IP to the RPC, and rate limits are per-IP — so
reads go through one cached `/api/state`, and writes go through `/api/send` with every tx
field supplied explicitly. Chain load stays constant no matter the crowd size.

## Run it locally

```bash
npm install
cp .env.example .env                # MASTER_KEY = a funded testnet wallet (local use only)
npm run compile && npm run deploy   # deploys BidBlitz, writes NEXT_PUBLIC_CONTRACT
npm run dev                         # http://localhost:3000
```

- No chain at all? Just `npm run dev` and open **/demo**.
- Free rooms need no chain at all — just Supabase (see below) and `npm run dev`.
- `npm run balance` shows the local dev wallet. `npm run bots -- <CODE>` runs bot bidders.
- Testnet MON: [faucet.monad.xyz](https://faucet.monad.xyz).

### Supabase (optional but recommended)

Supabase holds presentation state for MON rooms (metadata, item roster, avatars), host
accounts, photo uploads — and the **entire state of free rooms**, so it is required if you
want free mode.

Apply every migration in order:

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" npm run db:setup
```

(or paste `supabase/schema.sql`, `002_add_fund_amount.sql`, `003_storage.sql`, then
`004_free_rooms.sql` into the SQL Editor, in that order).

Then set in `.env`:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, safe in the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — **secret, server only.** Free rooms deny the browser entirely
  (RLS on, no policies) and every write goes through `/api/free/*` with this key. Without it,
  free mode returns 503.

### Deploy (Vercel)

Import the repo at vercel.com, then set the env vars from `.env` — the public `NEXT_PUBLIC_*`
ones plus `SUPABASE_SERVICE_ROLE_KEY` (and `OPENROUTER_API_KEY` for AI bots). `MASTER_KEY` is
**not** needed at runtime and should not be set there — it only deploys the contract and runs
the bot script from your laptop. Every push auto-deploys.

## Env vars

| Key | Where | What |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT` | public | Deployed BidBlitz address |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | public | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Server only; required for free rooms |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | public | Receives MON from point packs; blank disables them |
| `NEXT_PUBLIC_EVENT_SALT` | public | Salt for the bot script's throwaway wallets |
| `MASTER_KEY` | secret, **local only** | Deploys the contract, funds `npm run bots` |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | secret | AI bidders (optional) |
| `MONAD_RPC_URL` | secret | Private RPC (optional, recommended) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | secret | Free-room rate limiting (optional) |

There is deliberately no key here that can spend MON on a participant's behalf.

## Monad development skills used

Built with a set of development skills bundled under `.claude/skills/`:

- **MONSKILLS** — Monad-specific guidance. https://github.com/therealharpaljadeja/monskills · https://skills.devnads.com
- **Trail of Bits — Building Secure Contracts** — https://github.com/trailofbits/skills
- **SecSkills — Web3 pentesting** — used to audit `BidBlitz.sol`. https://github.com/trilwu/secskills
- **Monad docs** — https://docs.monad.xyz

## Screenshots

| Landing | Host a room |
|---|---|
| ![Landing](docs/screenshots/landing.png) | ![Host](docs/screenshots/host.png) |

| Fantasy draft | Big screen |
|---|---|
| ![Fantasy](docs/screenshots/fantasy.png) | ![Screen](docs/screenshots/screen.png) |

## Stack

Next.js 16 · viem · solc-js (no Foundry) · DiceBear (local avatars) · Supabase (free-room
state, metadata, accounts, uploads) · OpenRouter (AI bots) · Upstash Redis (rate limiting) ·
Monad testnet.

## Safety

On-chain rooms run on **Monad testnet** with valueless test MON, and participants use their
own wallets — BidBlitz never holds, custodies or spends anyone's funds, and there is no
server-side key that could.

Earlier versions derived a burner wallet from a single hash of a name and password. That is one
keccak of a guessable public string, so it was retired from every on-chain path once real MON
was escrowed behind it. It survives only in `npm run bots`, whose wallets are throwaway by
design.

Free-room identity is deliberately weak — a random id in localStorage, no account. It is a
party game with nothing at stake, and accounts are the friction the format exists to avoid.

Player photos and team logos are not bundled (they're copyrighted); generated art is used, and
hosts paste or upload images they have the rights to use.
