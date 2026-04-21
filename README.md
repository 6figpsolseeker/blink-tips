# blink-tips

Recurring tip vaults on Solana, shareable as [Blinks](https://docs.dialect.to/documentation/actions).

> **Status:** early prototype. Devnet only. The program has not been audited — do not deposit mainnet funds.

Paste `https://<your-host>/tip/<recipient-pubkey>` into any Blinks-aware client (X, Dialect, Actions-compatible wallets) and it renders an inline "Subscribe" card. One click opens a vault that streams SOL to the recipient per Solana slot; the recipient claims whenever they want.

## How it works

The program uses a **pull model** — no keepers, no cron, no off-chain infrastructure. The tipper deposits lamports into a PDA-derived vault with a per-slot vesting rate. On each `claim`, the recipient withdraws whatever has vested since the last claim. Unfunded slots don't accumulate back-pay.

```
tipper ──initialize_vault──▶ [Vault PDA: rate_per_slot, last_claim_slot]
                                          │
                                 (time passes, slots accrue)
                                          │
recipient ────claim────────▶ vested lamports transferred out
tipper    ────top_up───────▶ adds lamports (resets clock if empty)
tipper    ────close_vault──▶ settles vested, reclaims remainder
```

See the design rationale for why pull beat keeper-bot and pre-auth approaches: the pull model has zero off-chain dependencies and pairs naturally with compressed accounts for scale.

## Repo layout

```
blink-tips/
├── programs/tip-vault/      # Anchor program (Rust)
│   └── src/lib.rs
├── tests/                   # Mocha + ts-mocha integration tests
│   └── tip-vault.ts
├── web/                     # Next.js app serving Solana Actions endpoints
│   ├── app/
│   │   ├── api/actions/
│   │   │   ├── subscribe/[recipient]/route.ts
│   │   │   └── claim/[tipper]/[recipient]/route.ts
│   │   ├── lib/tip-vault.ts    # instruction builders + PDA helpers
│   │   └── tip/[recipient]/    # SSR fallback for non-Blink clients
│   └── public/actions.json     # Actions routing rules
├── Anchor.toml
├── Cargo.toml                # workspace
└── package.json              # root — anchor test harness
```

## Quickstart

**Prerequisites**

- [Rust](https://rustup.rs/) + [Solana CLI](https://docs.solanalabs.com/cli/install) ≥ 1.18
- [Anchor](https://www.anchor-lang.com/docs/installation) ≥ 0.30.1
- Node ≥ 20, npm or pnpm

**Build and deploy the program (devnet)**

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 2

anchor build
anchor keys sync      # writes the real program ID into Anchor.toml + lib.rs
anchor build          # rebuild with the new ID
anchor deploy --provider.cluster devnet
```

**Run the tests**

```bash
npm install            # at the repo root — installs @coral-xyz/anchor, mocha, ts-mocha
anchor test            # spins up solana-test-validator and runs tests/tip-vault.ts
```

**Run the web app**

```bash
cd web
cp .env.example .env.local
# edit .env.local with the program ID printed by `anchor deploy`
npm install
npm run dev
```

Open http://localhost:3000 — the root page lists available endpoints. Share `http://localhost:3000/tip/<recipient-pubkey>` in a Blink-aware client to test the subscribe flow (you'll need a tunnel like `ngrok` for off-host clients to reach your dev server).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/actions/subscribe/[recipient]` | Returns the Blink metadata (title, presets, custom-amount form). |
| `POST` | `/api/actions/subscribe/[recipient]?amount=&days=` | Returns an unsigned `initialize_vault` transaction. |
| `GET`  | `/api/actions/claim/[tipper]/[recipient]` | Returns the claim-Blink metadata. |
| `POST` | `/api/actions/claim/[tipper]/[recipient]` | Returns an unsigned `claim` transaction. |
| `GET`  | `/actions.json` | Declares which paths are Actions-compatible. |

## Roadmap

- [x] Mocha test suite: init → advance slots → claim → top-up-after-empty → close
- [ ] SPL token vaults (USDC) with per-vault ATAs
- [ ] Pyth-driven token conversion at claim time for multi-token tipping
- [ ] Compressed vault state via Light Protocol (sub-cent rent at scale)
- [ ] On-chain leaderboard / indexer for top supporters
- [ ] Optional keeper layer: creators opt in, keeper cranks `claim`, skims a small fee

## Known limitations

- **SOL only** for now. Multi-token support requires a token-vault variant.
- **Program ID is a placeholder** (`TipV1111…`). Run `anchor keys sync` before deploying.
- **Slot-based vesting** uses a fixed `SLOTS_PER_SECOND = 2.5` estimate in the Action endpoint. Real slot times drift; this affects stream *duration* presentation, not correctness of payouts.

## License

[MIT](LICENSE)
