# Session Handoff — 2026-07-19

## Status: v1.0.0 Prepared (not yet merged or published)

**Branch:** `feat/workstyle-testing` (draft PR #23 into `main`, pending final review + merge)
**Version:** 1.0.0 (will be published to npm once the owner sets NPM_TOKEN, pushes the tag, and creates a GitHub Release — publishing the Release, not the tag push, is what triggers `.github/workflows/publish.yml`)
**Tests:** 469 total (415 unit + 54 anvil) on every PR; nightly adds live/fork/testnet/scenarios

v1.0.0 is PREPARED but not yet published. `publish.yml` triggers on a GitHub Release being **published**, not on a tag push — a pushed tag alone will not publish to npm. Owner workflow:
1. Set the `NPM_TOKEN` secret in GitHub repo settings, and ensure the `@chainvault` npm scope/org exists (first `--access public` publish under a scope needs the org to exist)
2. Create and push the v1.0.0 git tag: `git tag v1.0.0 && git push origin v1.0.0`
3. Create the GitHub Release from that tag: `gh release create v1.0.0` — publishing this Release is what triggers `.github/workflows/publish.yml`
4. Verify both packages appear on npm: `npm view @chainvault/core version`, `npm view @chainvault/mcp version`

## Current Implementation State

### Core Modules (100% tested)
- **Vault:** Master vault, agent vaults, AES-256-GCM encryption, HKDF, WebAuthn/passkey, DualKeyManager
- **Rules Engine:** Chain access, tx type filtering, per-tx/daily/monthly spend limits, contract whitelist/blacklist, API access rules
- **Chain Module:** 14 EVM chains with PublicNode RPCs (WS priority, HTTP fallback), faucet support, EvmAdapter read + write, contract compilation
- **API Proxy:** Caching (5-min TTL), per-second + daily rate limiting, usage tracking
- **Audit:** AuditStore (SQLite `node:sqlite`), AuditLogger (file-based legacy), audit error status
- **Database:** SQLite persistence for spend tracking + audit logs (migrated from `better-sqlite3`)
- **MCP Server:** All 16 tools wired — zero stubs. RPC resolution from agent vault endpoints.

### Product Bug Fixes (Discovered & Fixed in Workstyle W0–W5)
1. **Audit 'error' status** — Error handling for audit logs
2. **SpendStore persistence wiring** — Spend tracking now wired into MCP server lifetime
3. **Vault RPC endpoint resolution** — `AgentContext.getRpcUrlForChain()` exposes agent vault RPC endpoints to tools
4. **BigInt JSON serialization** — Fixed contract output JSON encoding
5. **interact value ETH→wei conversion** — value parameter now correctly converted
6. **simulate value forwarding** — Properly passed through to simulation
7. **TUI .tsx never compiled** — Build system now includes TUI in output
8. **Stale test files in tarballs** — Pre-publish cleanup removes unnecessary test files

### Test Architecture (Vitest projects)
| Project | Contents | CI Gate? | Runs | Command |
|---------|----------|----------|------|---------|
| `unit` | 415 mocked/offline tests (existing + workstyle W1–W5) | Yes (PR) | Always | `npx vitest run --project unit` |
| `anvil` | 54 local anvil deterministic suites (W4–W5 lifecycle+edge) | Yes (PR) | Always | `npm run test:workstyle` |
| `live` | Public-RPC read-only tests on real chains | No | Nightly | `npm run test` (default includes) |
| `fork` | Real protocols (WETH, USDT, Uniswap) on mainnet fork | No | Nightly | `WORKSTYLE_FORK=1 npm run test:fork` |
| `testnet` | Sepolia smoke test (optional; skips if no TESTNET_PRIVATE_KEY) | No | Nightly/Manual | `npm run test:testnet` |
| `scenarios` | LLM agent workflow end-to-end tests (requires ANTHROPIC_API_KEY) | No | Nightly | `npm run test:scenarios` |

### CI Workflow (`ci.yml`)
- Runs on every PR + push to main
- **Job A (Node 22.x + 24.x):** `npm ci`, `tsc --noEmit`, `npm run build`, `vitest run --project unit`
- **Job B (Foundry):** `npm run test:workstyle` (anvil project)
- Both jobs required for merge

### Nightly Workflow (`nightly.yml`)
- Cron schedule (UTC 03:00)
- Manual trigger via `workflow_dispatch`
- Runs `npm run test` (live), `npm run test:fork`, `npm run test:testnet`, `npm run test:scenarios`
- On failure, opens/updates a tracking issue
- Secrets: `FORK_RPC_URL` (optional, defaults to `eth.drpc.org` — PublicNode's free tier rejects pinned-block reads), `TESTNET_PRIVATE_KEY` (optional but recommended), `ANTHROPIC_API_KEY` (required for scenarios), `ETHERSCAN_API_KEY` (optional)

## Test Infrastructure Helpers

Located in `tests/workstyle/helpers/`:

- **AnvilHarness** — Spawns/manages local anvil process
  - `start({ mode: 'local' | 'fork', forkUrl?, forkBlock?, chainId? })`
  - Readiness poll on `eth_chainId`, random free port (suites parallelize)
  - Deterministic mnemonic accounts via `accounts` property
  - Helpers: `setBalance()`, `impersonate()`, `snapshot()`/`revert()`, `mine()`, `stop()`

- **VaultFixture** — Real vault setup in temp directory
  - Inits master vault (password: `test-password`)
  - Imports anvil private keys
  - Registers anvil RPC endpoint (chain 31337)
  - Creates agents with configurable rules
  - Returns vault keys/paths — no test-only backdoors

- **Corpus Pipeline** — Compiles `tests/workstyle/contracts/*.sol`
  - Uses ChainVault's own compiler module
  - Gitignored artifact cache (keyed by source hash)
  - Self-contained single-file contracts

- **Secret Sweep** — `assertNoSecrets(value, secrets[])`
  - Recursively scans tool results, errors, audit rows
  - Detects raw private keys (with/without `0x`), `cv_agent_*` vault keys, API keys
  - Prevents accidental secret leakage in test output

## Design & Planning Documents

- **Design:** `docs/plans/2026-03-19-chainvault-mcp-design.md` (core architecture)
- **Implementation:** `docs/plans/2026-03-19-chainvault-mcp-implementation.md` (Task 1–15)
- **MCP Tool Wiring:** `docs/plans/2026-03-21-mcp-tool-wiring-design.md`
- **Tier 2+3 Tools:** `docs/plans/2026-03-24-mcp-tier2-tier3-design.md`
- **Workstyle Testing & Roadmap:** `docs/plans/2026-07-18-workstyle-testing-and-roadmap-design.md` (W0–W9 chunks)
- **Implementation Plan:** `docs/plans/2026-07-18-workstyle-testing-and-roadmap-implementation.md` (Task 1–25)
- **Testnet Runbook:** `docs/testnet-runbook.md`

## V2 Roadmap

V2.1 (Slither analysis foundation) is the next phase. **Each V2 chunk opens with its own brainstorm → design doc → implementation plan cycle**, using the design briefs in `docs/plans/2026-07-18-workstyle-testing-and-roadmap-design.md` §5 as the starting point.

**Sequence:**
1. **V2.1:** Slither static analysis in Docker, smart MCP orchestration (the differentiator)
2. **V2.2:** Aderyn analysis
3. **V2.3/V2.4:** Fuzzing and gas analysis (either order)
4. **V2.5/V2.6:** Web admin panel and non-EVM adapters (by demand)

Current deferred items:
- Nightly workflow dispatch verification after merge (post-publication check)
- Live Sepolia first run (after testnet secret is set)
- `.d.ts` emission (types fields dropped from package.json — tsc OOMs on viem types)
- Design-vs-implementation note on secrets held in context closure for server lifetime (decrypt-once-at-init) — flagged for V1.1 decision

## Commands

```bash
# Build and tests (local)
npm run build              # esbuild transpile
npx vitest run             # all tests (default: unit + anvil + live)
npx vitest run --project unit     # unit only (PR gate)
npm run test:workstyle     # anvil workstyle suite
npm run test:fork          # fork protocol suite (needs WORKSTYLE_FORK=1)
npm run test:testnet       # Sepolia smoke (needs TESTNET_PRIVATE_KEY)
npm run test:scenarios     # LLM agent workflows (needs ANTHROPIC_API_KEY)
npx tsc --noEmit           # type check

# Watch mode
npx vitest

# Serve MCP with agent vault key
CHAINVAULT_VAULT_KEY=cv_agent_... node packages/cli/dist/index.js serve -p <vault-path>
```

## Known Deferred

- **CLI commands:** Only 5 of ~20 designed commands are wired (init, serve, key list, agent list, solc pull). Backend implementations exist; need wiring in Commander.
- **Agent vault regeneration:** Design says "regenerate on permission change" — currently requires delete + recreate.
- **RPC endpoints in agent vaults:** Wired for tooling, but admin interface doesn't yet expose them separately from master vault view.

## Key Files & Contacts

| Purpose | Path |
|---------|------|
| Test suite root | `tests/workstyle/` |
| Test helpers | `tests/workstyle/helpers/` |
| Test contracts | `tests/workstyle/contracts/` |
| MCP server | `packages/core/src/mcp/server.ts` |
| MCP context | `packages/core/src/mcp/context.ts` |
| CLI entry | `packages/cli/src/index.ts` |
| Env config | `.env.example` (copy to `.env`) |

**Project Owner Contact:** Via repo or GitHub issues
