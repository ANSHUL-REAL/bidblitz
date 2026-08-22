# BidBlitz

**Live auctions where every bid is a Monad transaction.** Anyone hosts a room, shares a
four-character code, and the whole room bids in real time on a shared big screen — no
wallet install, no seed phrase. Built for Monad Blitz Hyderabad.

- **Live contract (Monad testnet):** [`0xe6ead02c583de6d75e02e4bb541f8b4034db87bf`](https://testnet.monadscan.com/address/0xe6ead02c583de6d75e02e4bb541f8b4034db87bf)
- **Chain:** Monad testnet (chain id `10143`)

---

## What it is

Three ways to run a room, all writing to the same contract:

- **Auction** — solo bidding on anything: memes, NFTs, games, cards, art, IRL items, or a
  category you name yourself. Add items live (paste an image, or use a preset), run each
  lot on a timer, sell to the highest bid.
- **Fantasy League** — a four-team draft (its own mode). Everyone who joins is drafted onto
  a squad; teammates share a purse and draft players together.
- **Play Solo** — a full practice auction against bots, no room and no wallet needed.

Every bid, sale, and winner badge is on-chain and independently verifiable on the block
explorer — you don't have to trust the app's UI.

## Why Monad

The format only works because Monad settles in well under a second, and a few of its
specifics shaped the whole build:

- **Sub-second finality (300ms blocks / 600ms finality)** — a 20-second lot can't wait
  12 seconds for a confirmation. Speed is the mechanic, not a benchmark.
- **Gas is billed on `gas_limit`, not gas used** — and reverted transactions still pay in
  full. So gas limits are hardcoded tight, and the client refuses to submit a bid it
  already knows is stale rather than eat a failed transaction.
- **Cold SLOAD costs 8,100 gas** (vs 2,100 on Ethereum) — the auction hot path is packed
  into a single storage slot so `placeBid` touches two slots, not five.
- **Reserve balance is computed from state 3 blocks back** — a freshly funded wallet's
  first bid would be silently excluded, so the client waits ~4 blocks ("arming") after
  funding before enabling bids, and funding is fanned out over an 8-relayer pool.

## Architecture

```
Phones (burner key OR MetaMask) ── signed tx ──▶ /api/send ──▶ RPC (fallback list)
                                                                    │
/api/fund (8-relayer pool, atomic nonce) ───────────────────────────┤
                                                                    ▼
/api/state  ONE multicall read, CDN-cached  ◀── every phone @1Hz + big screen @400ms
```

A whole room behind one venue Wi-Fi is a single IP to the RPC, and rate limits are
per-IP — so **all reads go through one cached `/api/state` call** fanned out over HTTP, and
writes go through `/api/send` with every transaction field supplied explicitly. Chain load
stays constant no matter how many people are in the room.

## Monad development skills used

This repo was built with a set of development skills bundled under `.claude/skills/`:

- **MONSKILLS** — Monad-specific development guidance (concepts, gas, addresses, scaffold,
  tooling). https://github.com/therealharpaljadeja/monskills · https://skills.devnads.com
- **Trail of Bits — Building Secure Contracts** — the EVM-relevant secure-development and
  audit skills. https://github.com/trailofbits/skills
- **SecSkills — Web3 pentesting** — the smart-contract audit skill used to review
  `BidBlitz.sol`. https://github.com/trilwu/secskills
- **Monad docs** — https://docs.monad.xyz

The contract was audited with the web3 skill before deploy; findings (a locked-funds path
and an unauthenticated global setter) were fixed — see the git history.

## Screenshots

| Landing | Host a room |
|---|---|
| ![Landing](docs/screenshots/landing.png) | ![Host](docs/screenshots/host.png) |

| Fantasy draft | Big screen |
|---|---|
| ![Fantasy](docs/screenshots/fantasy.png) | ![Screen](docs/screenshots/screen.png) |

## Run it locally

```bash
npm install
cp .env.example .env          # then set MASTER_KEY (a funded testnet wallet)
npm run wallets               # generates the 8-relayer pool into .env
npm run compile && npm run deploy   # deploys BidBlitz, writes NEXT_PUBLIC_CONTRACT
npm run fund-relayers         # seeds the relayers from MASTER
npm run dev                   # http://localhost:3000
```

To try it with no chain at all, just `npm run dev` and open **/demo**.

- `npm run bots -- <ROOMCODE>` runs eight bot bidders into a room (integration test /
  Wi-Fi contingency).
- Get testnet MON from [faucet.monad.xyz](https://faucet.monad.xyz).

## Stack

Next.js 16 · viem · solc-js (no Foundry) · DiceBear (local avatars) · Upstash Redis
(funding lock) · Monad testnet.

## Safety

Everything runs on **Monad testnet** with valueless test MON. Burner wallets are derived
from `keccak256("bidblitz|" + salt + "|" + name + "|" + password)` — the salt ships to the
browser, so it's public; anyone who knows a name and guesses the password can derive that
key. Fine for a testnet party game — **never reuse a real password**, and never reuse these
keys for anything real. Real player photos and team logos are not bundled (they're
copyrighted); players and teams use generated art, and a host can paste image URLs they
have the rights to use.
