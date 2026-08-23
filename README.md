# BidBlitz

**Live room-wide auctions.** Anyone hosts a room, shares a link or a six-digit code, and the
whole room bids in real time on a shared big screen.

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
`NEXT_PUBLIC_TREASURY_ADDRESS`. This is how the project pays for itself. Three rules keep it a
game purchase rather than a financial product, all enforced in code:

- **One way.** Points can never be converted back to MON. A two-way conversion would make this
  money transmission, which is a licensed business.
- **Free rooms only.** Free rooms award points and bragging rights — nothing of real value.
  Selling bidding power toward a *real prize* looks like a raffle in many jurisdictions;
  selling it toward a leaderboard is a video game. `/api/free/topup` refuses any room that
  isn't in the free tables.
- **A per-lot cap** (`free_rooms.max_bid`, defaulting to the starting purse). An auction is
  winner-take-all per lot, so without a ceiling a player holding 1300 points against everyone
  else's 50 wins *every* lot and the other nineteen people stop bidding. The cap means buying
  points lets you contest **more lots**, never be unbeatable on **one** — anyone can match the
  cap and race you for it.

Payment is verified against the chain, never trusted from the client: `/api/free/topup` re-reads
the transaction and checks it was mined and succeeded, went to the treasury, paid a pack price
exactly, is buried under 3 confirmations, and carries a memo binding it to that specific
(room, player). The memo is what stops somebody watching the chain and claiming a payment that
isn't theirs. `free_topups.tx_hash` is a primary key, so a replay credits nothing.

Leave `NEXT_PUBLIC_TREASURY_ADDRESS` blank and packs disappear entirely.

**Bots are opt-in.** Nothing adds them by itself. A host can add 2–6 and then toggle whether
they actually bid, so a quiet room can be warmed up and the bots left idle once real bidding
starts. They're ordinary players flagged `is_bot`, labelled as such, and driven from the host's
console — which means they stop when it closes. That's the honest behaviour for something that
is the host's prop rather than a player.

### MON rooms — `/r/<code>`

Every bid is a real transaction on Monad testnet, and each participant brings their own MON:

- **Real payout.** A bid is a **commitment**, not a payment. The clock picks a winner, and the
  winner then pays the host with `payLot()`. Only then is the lot sold and the badge minted.
- **On-chain play money.** Bids are just a score and no MON moves — but every bid is still a
  transaction, so bidders pay gas. Worth it for the permanent record and the winner badge;
  otherwise host a Free room.

Joining a MON room means connecting a wallet (MetaMask/Rabby/OKX/Backpack). If it is short of
gas, BidBlitz shows the address and a faucet link and waits — it does not, and cannot, fund it.

### Either kind

- **Fantasy League.** A four-team draft; everyone who joins is drafted onto a squad.
- **Play Solo / Demo.** A practice auction against bots — no room, no wallet. Toggle **AI
  bidders** to have the bots decide via an LLM (OpenRouter) and show their reasoning.

## How to host

**Hosting requires an account** (email or Google). Joining never does — a free room is a name
and a face, and a MON room is a wallet. The gate is on hosting only, because that's the side
with something to lose: without an account a free room is owned by nothing but a token in one
browser, and clearing it makes the room unrunnable.

1. Open **`/host`**, choose **Free** or **MON**, name the auction, pick categories, **Create**.
   A free room is instant; a MON room is an on-chain `createRoom` tx signed by your wallet.
2. **Invite** — copy the join link, share it (WhatsApp / Messages via the native sheet), or
   show the QR. Put `/f/<code>/screen` on a projector for the room itself.
3. **Build the list** of what you're auctioning — type each item, paste an image URL, upload a
   photo, or drop one on the panel. Presets are there too.
4. **START THE AUCTION** → the first item goes live on a timer.
5. **SELL** to the top bid → *"<item> sold to <name>"* → **CONTINUE** to the next item, which
   is named on the button so you know what you're about to announce.
6. **End the auction** → everyone sees who won which items.

MON rooms add one step: after the clock, the winner **pays** within 3 minutes. If they don't,
the lot goes back on the block and they lose their paddle for that room.

## Where to see the payments / on-chain transactions

Everything in a MON room is verifiable — you never have to trust the app's UI:

- **In-app live history:** `/r/<code>/history` streams the whole room's ledger straight from
  the chain — every **bid, sale, payment, default and host withdrawal** — and each row links to
  the real Monad transaction. Open to host and bidders alike.
- **The SOLD screen** shows the winner, the amount, and an explorer link.
- **After each bid**, the "view tx ↗" link opens that exact transaction.
- **Pay / Collect** show the `payLot()` and `withdraw()` txs — proof the MON reached the wallet.
- **On the block explorer** (source of truth):
  - All room activity: open the [contract address](https://testnet.monadvision.com/address/0x094a2bee94586c1a74d44ff69cc5c72ca87f1d07)
    → every `createRoom`, `placeBid`, `AwaitingPayment`, `LotPaid`, `LotDefaulted`, `LotSold`
    and `Withdrawn` event is there.
  - A specific payment: open the tx hash → see the MON `value` move.

Free rooms have their own ledger at **`/f/<code>/history`** — every lot, who won it, and the
bids underneath. It says plainly that there are no transactions to link, because there aren't;
that's what makes the room free.

> Play-money rooms move no MON (only gas is real). Real-payout rooms move real testnet MON —
> which has no cash value, but the transfers are genuinely on-chain.

## Why Monad

The format only works because Monad settles in well under a second, and a few specifics
shaped the whole build:

- **Sub-second finality (300ms blocks / 600ms finality)** — a 20-second lot can't wait for a
  slow confirmation. Speed is the mechanic.
- **Gas is billed on `gas_limit`, not gas used** — and reverted txs still pay in full. So gas
  limits are hardcoded tight and the client won't submit a bid it knows is stale.
- **Cold SLOAD costs 8,100 gas** — the auction hot path is packed into a single storage slot,
  so `placeBid` touches two slots, not five. The settlement state (`paid`, `payBy`) packs into
  that same word, costing no extra SSTORE.
- **Reserve balance is computed from state 3 blocks back** — a wallet that just received MON
  had a zero balance at B-3, so its first bid would be silently excluded at consensus, with no
  revert and no receipt. The client waits ~4 blocks ("arming") after it sees funds land.

## Real-MON settlement: a bid is a commitment

A bid used to **be** the payment — `placeBid` required `msg.value == amount`. It no longer
does. The clock picks a winner, and the winner settles afterwards:

| Function | Who | What |
|---|---|---|
| `placeBid` | anyone joined | Records a commitment. `msg.value` must be **0** |
| `payLot` | **the winner only** | Pays the exact amount → host credited, badge minted, lot sold |
| `defaultLot` | anyone, once the window closes | Releases the lot and bars the non-payer |

`payLot` is winner-only on purpose: letting a third party pay would force a sale the winner had
decided to walk away from. `defaultLot` is permissionless *after* the deadline so a room isn't
stuck behind a host who stepped away.

Bidding costs nothing up front, so a defaulter would otherwise be free to bid the maximum on
every lot and never settle. `defaulted[roomId][addr]` bars them from that room — one default,
no more paddle — which makes the attack cost the attacker the game they were trying to ruin.

This also **deletes** a category of risk rather than mitigating it: because no bid escrows,
there is nothing to refund an outbid bidder, nothing to return when a lot is cancelled, and no
bidder funds in the contract at all. `pendingWithdrawals` holds only what winners have paid,
claimed with `withdraw()` — a pull payment, so no settlement path makes an external call.

Verified on testnet across a full cycle (bid → timeout → pay → withdraw, plus a deliberate
default), with each guard checked by simulating it and reading back the custom error. The
contract's balance stays at zero throughout.

## Architecture

```
MON rooms (/r/<code>)
  Phones (own wallet) ── signed tx ──▶ /api/send ──▶ RPC (fallback list)
  /api/state   ONE cached chain read  ◀── every phone @1Hz + big screen @400ms
  /api/history chain-derived feed     ◀── the live transaction ledger

FREE rooms (/f/<code>)
  Phones ──▶ /api/free/bid ──▶ Postgres  (one conditional UPDATE decides the race)
  /api/free/state  ONE cached query      ◀── every phone @900ms + screen @400ms
  /api/free/log    the room's whole ledger, opened deliberately

Supabase   free-room state · room categories · item roster · avatars · accounts

No server-side wallet anywhere. Nothing here can spend a participant's MON.
```

A whole room on one venue Wi-Fi is a single IP to the RPC, and rate limits are per-IP — so
reads go through one cached `/api/state`, and writes go through `/api/send` with every tx
field supplied explicitly. Chain load stays constant no matter the crowd size.

Free-room writes never come from the browser. The `free_*` tables enable RLS with **no
policies** (denying anon outright) and every write goes through `/api/free/*` on the service
role key. That matters more than it looks: a free room has no wallet, so there is no signature
to check — if the browser could write directly, any player could set their own purse, sell a
lot to themselves, or bid as somebody else.

## Run it locally

```bash
npm install
cp .env.example .env                # MASTER_KEY = a funded testnet wallet (local use only)
npm run compile && npm run deploy   # deploys BidBlitz, writes NEXT_PUBLIC_CONTRACT
npm run dev                         # http://localhost:3000
```

- No chain at all? Just `npm run dev` and open **/demo**.
- Free rooms need no chain — just Supabase (below) and `npm run dev`.
- `npm run balance` shows the local dev wallet. `npm run bots -- <CODE>` runs bot bidders.
- Testnet MON: [faucet.monad.xyz](https://faucet.monad.xyz).

### Supabase (required for free rooms and accounts)

Supabase holds presentation state for MON rooms (metadata, item roster, avatars), accounts,
photo uploads — and the **entire state of free rooms**.

Apply every migration in order:

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" npm run db:setup
```

Or paste them into the SQL Editor in this order:

| File | What it adds |
|---|---|
| `schema.sql` | rooms, item roster, participants (MON-room presentation state) |
| `002_add_fund_amount.sql` | legacy column, kept for older projects |
| `003_storage.sql` | the `lots` bucket for photo uploads |
| `004_free_rooms.sql` | free rooms, lots, players, bids + the atomic bid/settle functions |
| `005_free_topups.sql` | point packs, with `tx_hash` as the anti-double-spend key |
| `006_free_room_lifecycle.sql` | ending a room, removing a player, win tracking |
| `007_free_history.sql` | saved history for logged-in players |
| `008_free_queue_and_cap.sql` | the prepared item queue and the per-lot bid cap |
| `009_accounts_bots_and_bid_auth.sql` | account-owned rooms, opt-in bots, **authenticated bids** |

Then set in `.env`:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, safe in the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — **secret, server only.** Without it, free mode returns 503.

**Google sign-in** (optional): create an OAuth client in Google Cloud Console with redirect
`https://<ref>.supabase.co/auth/v1/callback`, paste the ID and secret into Supabase →
Authentication → Providers → Google, and add your app's URLs under URL Configuration.

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
Monad testnet. TypeScript is being adopted incrementally — the shared API contract in
`src/lib/freeTypes.ts` is typed, `allowJs` keeps the rest compiling untouched.

## Safety

On-chain rooms run on **Monad testnet** with valueless test MON, and participants use their
own wallets — BidBlitz never holds, custodies or spends anyone's funds, and there is no
server-side key that could.

Earlier versions derived a burner wallet from a single hash of a name and password. That is one
keccak of a guessable public string, so it was retired from every on-chain path once real MON
was involved. It survives only in `npm run bots`, whose wallets are throwaway by design.

Free-room players hold a secret in their browser and only its hash is stored. That isn't
decoration: `/api/free/state` has to publish every player's id so the leaderboard, race track
and avatars can render, so the id cannot also be the proof of who is bidding — otherwise anyone
in the room could read a rival's off the wire and bid as them. The secret is that proof.

Player photos and team logos are not bundled (they're copyrighted); generated art is used, and
hosts paste or upload images they have the rights to use.
