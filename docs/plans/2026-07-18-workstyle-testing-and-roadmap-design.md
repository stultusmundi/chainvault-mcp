# Workstyle Testing & Roadmap Refinement — Design Document

**Date:** 2026-07-18
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

V1 and V1.1 are complete and merged: all 16 MCP tools wired, TUI, full CLI,
WebAuthn, Docker solc compiler, SQLite persistence, security hardening. 468
tests pass. But the test surface stops at the money line — deploy, interact,
spend-limit enforcement, and full agent workflows have never touched a real
chain (only viem mocks). There is no CI, and the package is not published
despite the README advertising `npm install -g chainvault-mcp`.

This document defines the path from here to a published, CI-verified v1.0
whose write path is proven against real contracts, and refines the V2 roadmap
(analysis platform) into defined work chunks.

**Decisions made with the project owner (2026-07-18):**

1. Testing environments: tiered — local anvil (per-commit CI), anvil mainnet
   fork (real deployed protocols), live testnet smoke (nightly/manual).
2. Test corpus: own in-repo Solidity corpus **plus** real deployed protocols
   (WETH, USDT, Uniswap, proxies) on forks.
3. Planning depth: fully detailed near-term chunks (W0–W9); V2 chunks at
   design-brief depth, each opening with its own design pass.
4. Release: CI + npm publish v1.0 are in scope now.
5. SQLite: migrate `better-sqlite3` → built-in `node:sqlite` (zero native
   deps for the published CLI; engines bump to >=22.13).

## 2. Destination

- **v1.0 (near-term):** published npm package, CI-verified on every PR,
  write path proven against real chains, security invariants demonstrated
  under real conditions — not just unit-mocked.
- **V2 (final destination):** the agent security-analysis platform —
  Slither/Aderyn/fuzzing behind smart MCP orchestration — plus web admin
  panel and non-EVM adapters. "Your agent gets blockchain superpowers
  without ever touching a private key" extends to "…and can audit what it
  deploys."

## 3. Test Architecture

### 3.1 Harness choice

Deterministic tiers are vitest suites under `tests/workstyle/`, driven by two
helpers. LLM-driven scenarios stay in the `tests/agent-e2e` style (tsx
scripts with structured assertions) because LLM output is non-deterministic
and suits report-style checks. Foundry is infrastructure only: anvil provides
chains; forge is not the test framework (ChainVault, not the contracts, is
the system under test).

### 3.2 Vitest projects (test tiers)

| Project | Contents | Needs | Runs |
|---------|----------|-------|------|
| `unit` | existing 468 mocked/offline tests minus live-RPC e2e | nothing | every PR |
| `anvil` | workstyle suites W4–W5 on local anvil | anvil binary, solc | every PR |
| `live` | existing `chain/e2e.test.ts` public-RPC read tests | network | nightly |
| `fork` | W6 real-protocol suites on anvil `--fork-url` | network, fork RPC | nightly |
| `testnet` | W8 Sepolia/L2 smoke | funded key | nightly (soft) / manual |
| scenarios | W7 agent-SDK scripts (outside vitest) | Anthropic key | nightly |

Each tier skips gracefully with a one-line reason when its prerequisite is
missing. `npx vitest run` keeps working locally (unit + anvil + live by
default is acceptable; exact default set finalized in W2).

### 3.3 Core helpers (`tests/workstyle/helpers/`)

**AnvilHarness** — spawn/manage anvil:
- `start({ mode: 'local' | 'fork', forkUrl?, forkBlock?, chainId? })` —
  readiness poll on `eth_chainId`, random free port so suites parallelize,
  deterministic mnemonic accounts. Fork mode pins a block number for
  determinism and RPC-cache reuse.
- Helpers: `accounts` (known anvil keys), `setBalance`, `impersonate`
  (`anvil_impersonateAccount`), `snapshot`/`revert` between tests, `mine`,
  `stop()` (kills process tree, always in `afterAll`).

**VaultFixture** — real vault plumbing in a temp dir:
- Inits master vault (password), imports anvil private keys, registers the
  anvil RPC endpoint (chain 31337), creates agents with configurable rules,
  returns vault keys/paths. Wraps existing `MasterVault` /
  `AgentVaultManager` APIs — no test-only backdoors into the vault.

**Corpus pipeline** — compiles `tests/workstyle/contracts/*.sol` through
ChainVault's **own compiler module** (dogfooding `compile_contract`'s
backend) into a gitignored artifact cache keyed by source hash. Corpus
contracts are single-file/self-contained (no import resolution dependency);
any OpenZeppelin-derived code is vendored minimal implementations.

**Secret sweep** — `assertNoSecrets(value, secrets[])` recursively scans
every string in tool results, thrown errors, and audit rows for raw private
keys (with/without `0x`), `cv_agent_` vault keys, API keys, and the master
password.

### 3.4 The RPC-resolution enabler (product feature, not test hack)

`EvmAdapter.fromChainId(chainId, customRpcUrl?)` already accepts a custom
RPC, but MCP tool handlers never pass one — agent-vault `rpc_endpoints` are
dead weight (known design-compliance gap). Fix:

- `AgentContext` exposes `getRpcUrlForChain(chainId): string | undefined`
  from the agent vault's `rpc_endpoints`.
- All chain tool handlers call
  `EvmAdapter.fromChainId(chain_id, ctx.getRpcUrlForChain(chain_id))`.
- Resolution order: **agent vault endpoint → static registry → clear error**.
- Rules still gate first: chain 31337 must be in the agent's `chains` list
  (rules engine already accepts arbitrary chain IDs).

Admin flow that the tests exercise end-to-end: add RPC endpoint for 31337 to
master vault → grant to agent → agent tools operate on anvil. Users get
custom/private/paid RPCs as a real capability.

## 4. Work Chunks

### W0 — Repo health (small)

1. **Migrate `db/` to `node:sqlite`** (`DatabaseSync`; near drop-in for the
   thin `database.ts`/`spend-store.ts`/`audit-store.ts` layer). Drop
   `better-sqlite3` + `@types/better-sqlite3`. Bump `engines` to
   `>=22.13.0` everywhere (`.npmrc` already has `engine-strict`). Keep the
   DB interface narrow so a swap-back stays cheap.
2. **RPC resolution** per §3.4 (AgentContext + tool handlers + tests).
3. Housekeeping: delete the 8 merged branches (local + remote), close stale
   PR #7, README badge 427→468, add `.DS_Store` to `.gitignore`, rename any
   stale references in `tests/agent-e2e`.

### W1 — CI (GitHub Actions)

1. **`ci.yml`** (push/PR): job A — `npm ci`, `tsc --noEmit`,
   `npm run build`, `vitest run --project unit` on Node 22.x + 24.x. Job B —
   install Foundry (`foundry-toolchain`), provision solc (static binary or
   Docker), run `--project anvil`. Both jobs required for merge.
2. **`nightly.yml`** (cron + `workflow_dispatch`): `live` + `fork` projects,
   testnet smoke (secrets permitting), agent scenarios
   (`ANTHROPIC_API_KEY`). On failure, opens/updates a tracking issue.
3. Secrets documented in CONTRIBUTING: `FORK_RPC_URL` (optional; defaults to
   PublicNode), `TESTNET_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, later
   `NPM_TOKEN`.
4. Pin the Foundry version; pin fork block numbers in test config.

### W2 — Workstyle test infrastructure

AnvilHarness, VaultFixture, corpus pipeline, secret-sweep helper, vitest
project split (`unit`/`anvil`/`live`/`fork`/`testnet`), npm scripts
(`test:workstyle`, `test:fork`, `test:testnet`), CI wiring for the `anvil`
project, CLAUDE.md quick-reference update. Includes a trivial smoke suite
(deploy nothing; start anvil, fund, read balance via EvmAdapter) proving the
harness end-to-end.

### W3 — Contract corpus

In-repo, self-contained Solidity (0.8.x), each with a one-line purpose:

| Contract | Exercises |
|----------|-----------|
| `TestToken.sol` (ERC20, constructor args) | deploy args, transfer/approve, events |
| `TestNFT.sol` (ERC721) | safeMint, tokenURI, indexed events |
| `PayableVault.sol` | payable deposit/withdraw, `receive`, native value |
| `Reverter.sol` | require strings, custom errors, panics — sanitized surfacing |
| `EventStorm.sol` | many/indexed events, log filtering ranges |
| `Factory.sol` + `Child.sol` | multi-contract deploys, address prediction |
| `CounterUUPS.sol` + `CounterV2.sol` | proxy deploy, upgrade, delegatecall reads |
| `GasHog.sol` | gas estimation limits, out-of-gas behavior |

Fork-tier target list (documented addresses, pinned block): WETH9, USDT
(non-standard returns), USDC (proxy), DAI, a fee-on-transfer token,
Uniswap V3 QuoterV2 + SwapRouter.

### W4 — Deploy & interact lifecycle suites (anvil)

Two levels for every corpus contract:
1. **Adapter level:** compile → `deployContract` → address/receipt →
   `readContract` → `writeContract` → `getEvents` → `getTransaction`.
2. **MCP level:** in-process MCP client (InMemoryTransport, real
   VaultFixture agent context): `deploy_contract`, `interact_contract`,
   `simulate_transaction`, `get_balance`, `get_contract_state`,
   `get_events`, `get_transaction`, `get_agent_address` (matches funded
   key), `compile_contract`.

Edge coverage: constructor args, payable value transfer, revert paths
(sanitized — assert no stack/internal leakage), sequential-tx nonces, gas
estimation sanity, simulate-before-write parity (simulate says revert ⇒
write would revert).

### W5 — Security & rules under real conditions

The proof a security product needs; all against real anvil transactions:

- **Spend limits:** per-tx boundary (exactly at limit passes, +1 wei-worth
  denies), daily accumulation across multiple real txs, monthly window,
  **restart survival** (tear down server context, reopen, SQLite-persisted
  spend still counts).
- **Access control:** chain denial, tx-type denial, contract
  whitelist/blacklist against real deployed corpus addresses.
- **Agent isolation:** two agents with disjoint grants; B cannot use A's
  key, chain, or API access; audit rows attribute correctly.
- **Rotation/revocation live:** rotate mid-session → old vault key fails;
  revoke → tools fail closed with sanitized errors.
- **Secret non-exposure sweep:** drive every tool through failure modes
  (dead RPC, revert, malformed input, locked vault) and run
  `assertNoSecrets` on every response, error, and audit row.
- **Denied ⇒ zero decryption:** spy on the crypto module's `decrypt`;
  denied requests must never trigger a vault decryption (observability spy,
  not behavior mock).

### W6 — Fork-tier real protocols (anvil `--fork-url`, pinned block)

Through MCP tools with a whale-impersonation funding step:
- WETH9 deposit / withdraw / balanceOf round-trip.
- USDT approve quirk (non-standard returns; must not break tool handling).
- USDC proxy read-through (implementation behind proxy).
- Uniswap V3 QuoterV2 static read + swap `simulate_transaction`.
- Fee-on-transfer token transfer (received != sent; tools report actuals).

### W7 — Agent workstyle scenarios (LLM-driven, nightly)

Extend `tests/agent-e2e` into a scenario runner (shared setup: build, vault
fixture, anvil, MCP server subprocess with agent env). Scenarios:

1. **Happy path:** "Compile and deploy TestToken, transfer 100 to X, report
   both balances." Assert: tool-call sequence, final chain state, audit rows.
2. **Mainnet denial:** "Deploy this on Ethereum mainnet." Assert: denial,
   no decryption, agent explains the restriction.
3. **Limit exhaustion:** tight daily limit; agent asked to overspend.
   Assert: first txs pass, later denied, audit shows both.
4. **Capability discovery:** "What can you do here?" Assert:
   `list_capabilities`/`list_chains` used; no hallucinated powers.

Assertions target tool calls, chain state, and audit logs — never prose.
One retry allowed per scenario (LLM nondeterminism); persistent failure
fails the nightly run.

### W8 — Live testnet tier (Sepolia + Arbitrum Sepolia)

- Preflight: balance check on the funded key; below threshold ⇒ skip with
  funding-runbook pointer (faucet URLs already in the chain registry).
- Smoke: deploy TestToken → interact → `get_events` →
  **real `verify_contract` on Etherscan** → `query_explorer` →
  `query_price`. Tight spend limits bound the cost.
- Ops runbook in `docs/`: key provisioning, faucet top-up, expected spend.

### W9 — Release readiness (v1.0)

1. Package naming: README promises `chainvault-mcp`; recommend renaming
   `@chainvault/cli` → `chainvault-mcp` (single install target) with
   `@chainvault/core` staying scoped. Final call at implementation.
2. Publish hygiene: `bin`/`files`/`exports` audit, `prepublishOnly` build,
   LICENSE check, `npm pack` + install-from-tarball global smoke test
   (`chainvault init/serve` from a clean dir).
3. `publish.yml`: tag-triggered, npm provenance, `NPM_TOKEN`.
4. v1.0.0: CHANGELOG, README truth pass (badges, quick start, testing
   section), tag + GitHub release.

## 5. V2 Chunks (design-brief depth — each opens with its own design pass)

**V2.1 Analysis foundation + Slither.** `packages/analysis`; Docker runner
abstraction (image mgmt, mounts, timeouts, resource caps); Slither
integration; `analyze_contract` MCP tool with orchestration modes ("quick
check" → fast detectors, "deep audit" → full suite) and **runtime estimates
returned before execution**. Key decisions: findings schema, Docker-optional
degradation, rules-engine treatment of analysis (free/read-class). Accept:
agent gets actionable findings for a corpus contract in both modes.

**V2.2 Aderyn second opinion.** Aderyn container; merge findings into the
V2.1 unified schema with de-duplication and tool attribution. Accept: one
merged report from both tools with per-tool provenance.

**V2.3 Fuzzing (Echidna/Medusa).** Property-test harness generation from
ABI + agent-supplied invariants; long-run job control (start/status/stop
tools — first long-running MCP operations). Accept: agent fuzzes a corpus
contract with a seeded bug and receives the violation trace.

**V2.4 Gas optimization analysis.** Built on Slither detectors + estimation
deltas against corpus baselines. Accept: report with concrete optimization
suggestions on `GasHog.sol`.

**V2.5 Web admin panel.** `packages/web`, served by the MCP process; parity
with TUI screens; passkey-native login (WebAuthn already in core). Opens
with its own threat-model pass (admin surface over HTTP).

**V2.6 Non-EVM adapter #1 (Solana).** Validates the `ChainAdapter`
abstraction; expect interface changes (accounts vs contracts) — budget for
an adapter-interface revision, not just an implementation.

Order: V2.1 → V2.2 → V2.3/V2.4 (parallelizable) → V2.5/V2.6 by demand.
V2.1 is the differentiator and goes first.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Public RPC flakiness | fork/live tiers run nightly, never gate PRs; pinned fork blocks enable anvil RPC caching |
| `node:sqlite` maturity | thin DB layer behind a narrow interface; swap-back to better-sqlite3 is cheap |
| Faucet/testnet funds dry up | preflight balance check skips gracefully; runbook for top-up; tight spend limits |
| LLM nondeterminism (W7) | assert on tool calls/state/audit, not prose; one retry; nightly not PR-gating |
| Anvil/Foundry version drift | pin Foundry version in CI; harness asserts anvil version at start |
| Docker unavailable (solc) | compiler module already supports local binary; CI uses static solc |
| Corpus import resolution | corpus is single-file/self-contained by design |

## 7. Sequencing

| Order | Chunk | Size | Gates |
|-------|-------|------|-------|
| 1 | W0 health (sqlite, RPC resolution, housekeeping) | S | — |
| 2 | W1 CI | S | W0 |
| 3 | W2 infrastructure | M | W0 (RPC resolution) |
| 4 | W3 corpus | S–M | W2 |
| 5 | W4 lifecycle suites | M | W2, W3 |
| 6 | W5 security suites | M | W4 |
| 7 | W6 fork tier | M | W2, W3 |
| 8 | W7 agent scenarios | M | W4 |
| 9 | W8 testnet tier | S | W4 |
| 10 | W9 release v1.0 | M | W1–W5 green in CI |
| 11+ | V2.1 … V2.6 | L each | v1.0 shipped |

W6/W7/W8 can proceed in parallel after W4. Release (W9) requires the
per-commit tiers (unit + anvil) green in CI — nightly tiers inform but do
not gate.
