# @chainvault/core

MCP server core with vault, rules, chain, proxy, and audit modules.

## Module Boundaries

- `vault/` — Encryption, master vault, agent vaults. NEVER import from `chain/` or `proxy/`
- `rules/` — Rule engine. Depends only on `vault/types.ts` for AgentConfig
- `chain/` — ChainAdapter interface + EVM implementation. NEVER import from `vault/` directly
- `proxy/` — API proxy with caching/rate limiting. Standalone, no vault imports
- `audit/` — Append-only logger. Standalone, no vault imports
- `mcp/` — Wires all modules together. Only module allowed to import from all others

## Encryption Standards

- AES-256-GCM for all encryption (12-byte IV, 16-byte auth tag)
- HKDF with SHA-256 for key derivation from passwords
- Random 256-bit keys for agent vaults via `crypto.randomBytes(32)`
- Format: `cv_agent_<64-hex-chars>` for agent vault key strings

## Testing

- Every public function has tests
- Test files live next to source: `foo.ts` → `foo.test.ts`
- Use temp directories (`mkdtemp`) for vault tests, clean up in `afterEach`
- Mock external dependencies (viem, fetch) — never hit real RPCs in unit tests
