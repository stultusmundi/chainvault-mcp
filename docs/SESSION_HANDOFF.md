# Session Handoff — 2026-03-25

## Current State

- **Branch:** `feat/mcp-tier2-tier3` (also has security fixes on top)
- **Tests:** 455 passing across 34 test files
- **Build:** esbuild via `npm run build` (tsc OOMs on viem types)
- **Open PR:** #7 (`feat/mcp-tier2-tier3`) — Tier 2+3 tool wiring, but security fixes (commits `af2c198`–`4dccd3c`) were added after. Needs updating or a new PR.
- **Dev vault:** `.chainvault-dev/` with password `chainvault`, agent `dev-agent` with vault key `cv_agent_687c8827ae5f6d601d9b33cabf5e1fef7713ba0ea8fe0275bdeab289c7ac5280`

## What's Complete

### Core Modules (all tested)
- **Vault:** Master vault, agent vaults, AES-256-GCM encryption, HKDF, WebAuthn/passkey, DualKeyManager
- **Rules Engine:** Chain access, tx type filtering, per-tx/daily/monthly spend limits, contract whitelist/blacklist, API access rules
- **Chain Module:** 14 EVM chains with PublicNode RPCs (WS priority, HTTP fallback), faucet support, EvmAdapter with read + write operations
- **API Proxy:** Caching, per-second + daily rate limiting, usage tracking
- **Audit:** AuditStore (SQLite) + AuditLogger (file-based legacy)
- **Compiler:** Solidity compilation via Docker solc or local binary
- **Database:** SQLite persistence for spend tracking + audit logs

### MCP Server (all 15 tools wired — zero stubs)
| Tool | Backend |
|------|---------|
| `list_chains` | Agent config |
| `list_capabilities` | Agent config |
| `get_agent_address` | Agent vault (public addr only) |
| `get_balance` | EvmAdapter + rules |
| `get_contract_state` | EvmAdapter + rules |
| `get_transaction` | EvmAdapter + rules |
| `get_events` | EvmAdapter + rules |
| `simulate_transaction` | EvmAdapter + rules |
| `deploy_contract` | EvmAdapter + rules + private key + spend tracking |
| `interact_contract` | EvmAdapter + rules + private key + spend tracking |
| `verify_contract` | Etherscan API + vault API key |
| `compile_contract` | solc via Docker/local |
| `query_explorer` | ApiProxy + vault API key + rate limits |
| `query_price` | CoinGecko public API |
| `list_supported_chains` | Chain registry |
| `request_faucet` | Faucet module |

### Security Hardening (done)
- Error messages sanitized — `sanitizeError()` strips potential key material
- Controlled vault accessors — `getPrivateKeyForChain()`, `getApiKeyForExplorer()` instead of raw `vaultData`
- Spend recorded after successful write operations
- Audit logging in all MCP tool handlers
- Rules checked BEFORE vault decryption

### TUI (6 screens, all e2e tested)
Dashboard, Keys, Agents, Services, Logs, Rules — 128+ e2e tests

### Infrastructure
- Community files: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GitHub templates
- `.env` support with dotenv
- Agent e2e tests via Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- `chainvault solc pull` CLI command

## Remaining Items

### Medium Priority — CLI Commands Gap

Only 5 of ~20 designed CLI commands are wired in `packages/cli/src/index.ts`:

| Wired | Missing |
|-------|---------|
| `init` | `unlock`, `lock` |
| `serve` | `status` |
| `key list` | `key add`, `key remove`, `key generate`, `key add-seed` |
| `agent list` | `agent create`, `agent show`, `agent revoke`, `agent rotate-key`, `agent grant`, `agent set-limit`, `agent allow-tx`, `agent set-api-limit` |
| `solc pull` | `api add`, `api list`, `api remove`, `api add rpc` |
| | `logs`, `logs <agent>`, `logs --denied` |

Backend implementations exist in `packages/cli/src/commands/key.ts` and `packages/cli/src/commands/agent.ts` — they just need to be wired into Commander in `index.ts`. Some commands (like `key add`) need interactive password prompting since secrets must never be CLI arguments.

### Low Priority — Design Compliance

1. **Agent vault regeneration on permission change** — Design says "When permissions change, agent vault is regenerated from master vault." Not implemented. Currently you'd delete and recreate the agent.

2. **RPC endpoints in agent vaults** — `AgentVaultManager.createAgent()` already copies matching RPC endpoints into agent vaults, but the MCP `AgentContext` doesn't expose them. Tools use `EvmAdapter.fromChainId()` which reads from the chain registry instead.

3. **`tests/agent-e2e/claude-code.d.ts`** — Still declares module `@anthropic-ai/claude-code` but code imports from `@anthropic-ai/claude-agent-sdk`. Should be renamed and updated.

### Housekeeping

- **PR #7** is open but stale — security fix commits (`af2c198`–`4dccd3c`) were pushed to main/branch after PR creation. Should either update the PR or close and create a new one.
- **Old branches** can be cleaned up: `feat/chainvault-core`, `feat/v1.1-tui-sqlite`, `feat/v1.1-webauthn-compiler`, `feat/e2e_tests`, `feat/mcp-tool-wiring`

### V2 Roadmap (not started)
- Slither/Aderyn analysis tools (Docker containers)
- Web admin panel
- Non-EVM chain adapters (Solana, Move, Bitcoin)

## Key Files

| Purpose | Path |
|---------|------|
| Design doc | `docs/plans/2026-03-19-chainvault-mcp-design.md` |
| Implementation plan | `docs/plans/2026-03-19-chainvault-mcp-implementation.md` |
| MCP tool wiring design | `docs/plans/2026-03-21-mcp-tool-wiring-design.md` |
| Tier 2+3 design | `docs/plans/2026-03-24-mcp-tier2-tier3-design.md` |
| Agent context | `packages/core/src/mcp/context.ts` |
| MCP server | `packages/core/src/mcp/server.ts` |
| Chain tools | `packages/core/src/mcp/tools/chain-tools.ts` |
| CLI entry | `packages/cli/src/index.ts` |
| Dev vault | `.chainvault-dev/` (password: `chainvault`) |
| Env config | `.env` (has CHAINVAULT_PASSWORD, CHAINVAULT_PATH, CLAUDE_CODE_OAUTH_TOKEN) |

## Commands

```bash
npm run build          # esbuild transpile (not tsc)
npx vitest run         # 455 tests
npx tsc --noEmit       # type check only
npx vitest run packages/core/src/mcp/  # MCP tests only

# Serve with agent context
CHAINVAULT_VAULT_KEY=cv_agent_687c8827ae5f6d601d9b33cabf5e1fef7713ba0ea8fe0275bdeab289c7ac5280 \
  node packages/cli/dist/index.js serve -p .chainvault-dev

# Agent e2e tests (need CLAUDE_CODE_OAUTH_TOKEN in .env)
npx tsx tests/agent-e2e/chain-discovery.ts
npx tsx tests/agent-e2e/compile-token.ts
```
