# ChainVault MCP

Secure MCP server gateway between AI agents and EVM blockchains with vault-based key management.

## Quick Reference

- Build: `npm run build`
- Test: `npx vitest run`
- Test watch: `npx vitest`
- Type check: `npx tsc --noEmit`
- Single test: `npx vitest run path/to/file.test.ts`

## Architecture

Monorepo with npm workspaces. Two packages:
- `packages/core` — MCP server, vault, rules engine, chain adapters, API proxy
- `packages/cli` — TUI (Ink/React) and direct CLI commands (Commander)

## Key Conventions

- ES modules everywhere (`import`/`export`, not `require`)
- Zod for all runtime validation (vault data, tool inputs)
- `viem` for EVM interaction (not ethers.js)
- `vitest` for testing with TDD workflow
- Strict TypeScript — no `any` except in ABI types from viem

## Commit Style

- Concise, imperative, under 72 chars: `feat(vault): add key rotation`
- Prefixes: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`
- Scope in parens: `vault`, `rules`, `chain`, `proxy`, `mcp`, `cli`, `tui`

## Security Invariants

IMPORTANT: These rules are non-negotiable.

- Private keys and API keys are NEVER logged, returned to agents, or included in error messages
- Secrets exist in memory only during the operation that needs them, then are wiped
- Rules engine runs BEFORE any vault decryption — denied requests have zero secret exposure
- Agent vaults contain only secrets explicitly granted by admin

## Design Docs

- @docs/plans/2026-03-19-chainvault-mcp-design.md
- @docs/plans/2026-03-19-chainvault-mcp-implementation.md
