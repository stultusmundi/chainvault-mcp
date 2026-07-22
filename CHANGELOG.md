# Changelog

## Unreleased

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
  Sepolia, Amoy, Fuji) gain one.
- **Private key normalization:** the vault (`MasterVault.addKey`) now accepts a
  raw 64-hex private key without the `0x` prefix and normalizes it, instead of
  throwing an opaque viem error.

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
