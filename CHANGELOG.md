# Changelog

## Unreleased

- **`verify_contract` access control (#11):** the tool checked only that an
  agent context existed. It now runs the same two gates as every other tool —
  chain access, then the API endpoint whitelist — and submits through `ApiProxy`
  instead of a bare `fetch`, so verification counts against the agent's rate
  limit and usage totals. Previously an agent scoped to Sepolia could verify on
  mainnet, and could submit verifications without limit.
- `ApiProxy` gained POST support. POST responses are never cached (a
  verification submission is not a lookup), and the API key travels in the
  form body rather than the query string, keeping it out of URL logs.
- All tools now share one `ApiProxy` instance. A per-tool proxy handed each
  agent a fresh rate-limit allowance per tool.
- **Deploy gas counts against spend limits (#13 part B):** `deploy_contract`
  recorded a hardcoded spend of `0`, so deployments — whose entire cost is gas —
  never touched an agent's limits. The adapter now reports `gasUsed` and
  `gasCostEth` from the receipt, and the tool charges that amount.
  When the target chain has a finite limit configured, the cost is also
  estimated from the agent's *public* address and checked before the private key
  is fetched, making the limit preventive rather than retroactive. An estimate
  that cannot be obtained fails closed. Chains with no limits skip the estimate
  entirely, so the common unlimited-testnet path is unchanged.

## 1.1.0 — 2026-09-04

Security hardening (from a verification pass over the March review backlog):

- **Path traversal (#12):** agent names are restricted to `[a-zA-Z0-9_-]` and
  every vault path is built through a validating guard, closing an
  arbitrary file read/write/delete via names like `../../x`.
- **Spend-limit bypass (#13):** the rules engine now rejects non-numeric,
  `NaN`, `Infinity`, and negative transaction values before comparison —
  previously such values slipped past every spend limit.
- **solc tag injection (#14):** the Docker compiler validates the solc
  version against strict semver before it is used as an image tag.
- **Error redaction (#16):** `sanitizeError` is now a single shared utility;
  it redacts `cv_agent_` vault keys and bare 64+-hex private keys in addition
  to `0x`-prefixed keys and any-scheme URLs.

Deferred: #13 part B (counting deploy gas against spend limits) is a
limit-semantics decision left for a follow-up.

### Etherscan V2 & key handling

- **Etherscan V2 migration:** `query_explorer` and `verify_contract` now call
  the unified Etherscan V2 endpoint (`https://api.etherscan.io/v2/api`) with a
  `chainid` parameter instead of the deprecated per-chain V1 hosts
  (api-sepolia.etherscan.io, api.polygonscan.com, ...), which Etherscan has shut
  down. A single Etherscan API key now serves every supported chain — and the 7
  chains that previously had no explorer API (e.g. Base/Arbitrum/Optimism
  Sepolia, Amoy, Fuji) gain one. **Migration:** agents provisioned with a
  per-chain key (PolygonScan, Arbiscan, ...) must be re-keyed with a single
  `etherscan` key — the per-chain hosts no longer work. Explorer key matching
  is also tightened to registrable-domain equality (a key under a look-alike
  domain like `foo.etherscan.io.evil.com` no longer matches).
- **Private key normalization:** the vault (`MasterVault.addKey`) now accepts a
  raw 64-hex private key without the `0x` prefix and normalizes it, instead of
  throwing an opaque viem error.

### Tooling & CI

- **Type-check is real again (#33):** `npm run lint` previously ran
  `tsc --noEmit`, which resolved to zero input files and passed vacuously.
  It now runs two dedicated configs covering both packages, the root `tests/`
  trees and `vitest.config.ts` — 89 source and 53 test files. The OOM that
  forced the check to be disabled is contained by a typed `registerTool`
  wrapper (`mcp/tools/register.ts`), which performs the Zod inference itself so
  the MCP SDK's unbounded generic is never instantiated. All tool registrations
  must go through it.
- **anvil 1.8 compatibility:** anvil 1.8 mines auto-mined transactions
  asynchronously, so a write tool can return a hash before the block exists.
  Every "write then immediately read" assertion in the workstyle and fork
  suites raced the miner. The harness now waits for the receipt. Product
  behaviour is unchanged — returning a hash without blocking is correct.
- **Deterministic toolchain:** CI pins foundry to `v1.8.1` instead of tracking
  `stable`, so an upstream release can no longer redden the build unannounced.
- **Fork suite resilience:** the fork tier probes several archive endpoints,
  falls back across them when anvil cannot complete a fork, and skips with a
  warning when they all throttle — instead of failing the nightly and filing an
  issue for a third-party outage.

## 1.0.1 — 2026-07-20

- **Packaging:** CLI published as `@chainvault/mcp` (scoped; was `chainvault-mcp`).
  The installed command is unchanged: `chainvault`.
- **Packaging:** normalized the `bin` path so npm no longer warns at publish.
- **CI:** releases publish via npm Trusted Publishing (OIDC) — no token secrets.

## 1.0.0 — 2026-07-18

First stable release.

- **Vault:** AES-256-GCM master + per-agent vaults, HKDF password derivation,
  WebAuthn/passkey unlock, key rotation, instant revocation, auto-lock.
- **Rules engine:** per-agent chain access, tx-type filtering, per-tx/daily/monthly
  spend limits (SQLite-persisted across restarts), contract allow/deny lists.
- **MCP server:** 16 tools — deploy, interact, simulate, read state/events/txs,
  compile (Docker/local solc), explorer + price proxy, faucets, capability discovery.
- **Chains:** 14 EVM networks with PublicNode RPCs; per-agent custom RPC endpoints
  (including local/private chains) resolved from the agent vault.
- **Audit:** every request logged approved/denied/error; no secrets ever logged.
- **Verified against real chains:** anvil-backed write-path suites, mainnet-fork
  protocol tests (WETH/USDT/USDC/Uniswap), and LLM-driven agent workflow scenarios
  run in CI. Live Sepolia smoke test workflow verified; pending first funded run.
