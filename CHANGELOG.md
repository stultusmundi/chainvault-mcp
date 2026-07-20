# Changelog

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
