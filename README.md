# BidBlitz

**Live room-wide auctions where every bid is a Monad transaction.** Anyone hosts a room,
shares a four-character code or a QR, and the whole room bids in real time on a shared big
screen — no wallet install, no seed phrase. Built for Monad Blitz Hyderabad.

- 🌐 **Live app:** https://bidblitz-anshul-reals-projects.vercel.app
- 🔗 **Contract (Monad testnet):** [`0x2bebf0247d1bcc007935237c723ebbac6ade8f59`](https://testnet.monadvision.com/address/0x2bebf0247d1bcc007935237c723ebbac6ade8f59)
- ⛓ **Chain:** Monad testnet (chain id `10143`)

---

## What it is

Ways to run a room, all writing to the same contract:

- **Auction — play money.** Solo bidding on anything (memes, NFTs, games, cards, art, IRL
  items, or a category you name). Bids are a game score; the winner gets the item + a
  soulbound badge. Free to run — the pool only covers gas.
- **Auction — real payout.** Same auction, but **bids are real MON, escrowed on-chain**.
  When you SELL, the winning bid is **paid to the host**; outbid bidders are **refunded**.
  You collect it with a `withdraw()` and show the transaction as proof.
- **Fantasy League.** A four-team draft (its own mode); everyone who joins is drafted onto a
  squad that shares a purse.
- **Play Solo / Demo.** A full practice auction against bots — no room, no wallet. Toggle
  **AI bidders** to have the bots decide via an LLM (OpenRouter) and show their reasoning.

Joining never needs an account: scan the QR, pick a name + password + avatar, and you're
bidding in ~15 seconds on a burner wallet that's funded for you. MetaMask/Rabby/OKX/Backpack
work too. Only the **host** signs in (email) — to manage events, set MON distribution, and
watch the history dashboard.

## How to host a demo (60 seconds)

1. Open **`/host`**, name the auction, pick categories, choose **Play money** or **Real
   payout**, and **Create** (an on-chain `createRoom` tx). You get a room **code**.
2. Put **`/r/<code>/screen`** on a projector — it shows a **QR + the code**.
3. People **scan → join** (`/r/<code>`), pick an avatar, and get a giant **BID** button.
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
  - All room activity: open the [contract address](https://testnet.monadvision.com/address/0x2bebf0247d1bcc007935237c723ebbac6ade8f59)
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
- **Reserve balance is computed from state 3 blocks back** — a freshly funded wallet's first
  bid would be silently excluded, so the client waits ~4 blocks ("arming") after funding, and
  funding is fanned out over an 8-relayer pool.

## Real-MON escrow, safely

Escrow rooms hold real value, so the contract uses a **pull-payment** design: `placeBid`
escrows exactly the bid; an outbid bidder is credited to `pendingWithdrawals`; on sale the
winning bid is credited to the host; everyone pulls with `withdraw()`. The settlement path
makes **no external call**, so there's no reentrancy surface, and a permissionless
`finalize()` lets the winner (or anyone) settle an expired lot so escrowed MON can never be
trapped by an absent host. Audited before deploy (see git history).

## Architecture

```
Phones (burner key OR MetaMask) ── signed tx ──▶ /api/send ──▶ RPC (fallback list)
/api/fund (8-relayer pool, atomic nonce, host-set + capped airdrop) ─────────┤
                                                                             ▼
/api/state   ONE cached chain read     ◀── every phone @1Hz + big screen @400ms
/api/history chain-derived event feed  ◀── the live transaction ledger
Supabase     room categories · item roster · participant avatars · host accounts
```

A whole room on one venue Wi-Fi is a single IP to the RPC, and rate limits are per-IP — so
reads go through one cached `/api/state`, and writes go through `/api/send` with every tx
field supplied explicitly. Chain load stays constant no matter the crowd size.

## Run it locally

```bash
npm install
cp .env.example .env          # then paste MASTER_KEY (a funded testnet wallet)
npm run wallets               # generates the 8-relayer pool into .env
npm run compile && npm run deploy   # deploys BidBlitz, writes NEXT_PUBLIC_CONTRACT
npm run fund-relayers -- 1    # seeds each relayer with 1 MON from MASTER
npm run dev                   # http://localhost:3000
```

- No chain at all? Just `npm run dev` and open **/demo**.
- `npm run balance` shows master + relayer balances. `npm run bots -- <CODE>` runs bot bidders.
- Testnet MON: [faucet.monad.xyz](https://faucet.monad.xyz).

### Supabase (optional but recommended)

Presentation state (room metadata, item roster, participant avatars), host accounts, and
photo uploads. In the project's **SQL Editor**, run in order: `supabase/schema.sql`, then
`supabase/002_add_fund_amount.sql`, then `supabase/003_storage.sql`. Put the project URL +
publishable key in `.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

### Deploy (Vercel)

Import the repo at vercel.com, then set the env vars from `.env` — the public
`NEXT_PUBLIC_*` ones and the secret `RELAYER_KEYS` (and `OPENROUTER_API_KEY` for AI bots).
`MASTER_KEY` is **not** needed at runtime (only for the local deploy/funding scripts). Every
push auto-deploys.

## Env vars

| Key | Where | What |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT` | public | Deployed BidBlitz address |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | public | Supabase project |
| `NEXT_PUBLIC_EVENT_SALT` | public | Burner-key derivation salt |
| `NEXT_PUBLIC_HOST_EMAILS` | public | Emails allowed to host (comma-separated) |
| `RELAYER_KEYS` | secret | 8 relayer keys that fund joiners |
| `MASTER_KEY` | secret, local only | Funds the relayers (scripts only) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | secret | AI bidders (optional) |
| `MONAD_RPC_URL` | secret | Private RPC (optional, recommended) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | secret | Funding lock (optional) |

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

Next.js 16 · viem · solc-js (no Foundry) · DiceBear (local avatars) · Supabase (metadata,
accounts, uploads) · OpenRouter (AI bots) · Upstash Redis (funding lock) · Monad testnet.

## Safety

Everything runs on **Monad testnet** with valueless test MON. Burner wallets are derived from
`keccak256("bidblitz|" + salt + "|" + name + "|" + password)` — the salt is public, so anyone
who knows a name and guesses the password can derive that key. Fine for a testnet party game —
**never reuse a real password**, and never reuse these keys for anything real. Player photos
and team logos are not bundled (they're copyrighted); generated art is used, and hosts paste
or upload images they have the rights to use.
