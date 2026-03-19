# @chainvault/cli

TUI and CLI for ChainVault MCP administration.

## TUI Stack

- Ink 5.x (React renderer for terminal)
- React 18.x for component structure
- ink-ui for standard components (Select, TextInput, Spinner)

## CLI Stack

- Commander.js for direct command parsing
- Commands in `src/commands/` — one file per command group

## Conventions

- TUI is the primary interface — `chainvault` with no args launches TUI
- Direct commands exist for scripting: `chainvault key list`, `chainvault agent create`
- Secrets are NEVER accepted as CLI arguments — always prompt interactively or read from stdin
- All vault operations must call `vault.lock()` in a finally block
