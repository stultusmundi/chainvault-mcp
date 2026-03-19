# ChainVault MCP V1.1 Design

## Goal

Add interactive TUI for vault administration and persistent spend tracking backed by SQLite. These are the two highest-priority V1.1 items — TUI is the primary user experience, spend tracking is safety-critical for real chain usage.

## Scope

**In scope:**
- Interactive TUI with 6 screens (Dashboard, Keys, Agents, Services, Logs, Rules)
- SQLite database layer for spend tracking and audit logs
- Password prompt with masked input and 15-minute auto-lock
- Migration of audit logger from JSON-line files to SQLite

**Out of scope (deferred to later):**
- WebAuthn/Passkey authentication
- Contract compilation (solc integration)
- Non-EVM chain adapters
- Analysis tools (Slither/Aderyn)

---

## 1. SQLite Database Layer

### Package

New dependency: `better-sqlite3` in `@chainvault/core`.

Synchronous API (no async overhead), fast, widely used. DB file stored at `~/.chainvault/chainvault.db` alongside vault files.

### Schema

```sql
CREATE TABLE spend_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_spend_agent_chain ON spend_records(agent_name, chain_id, timestamp);

CREATE TABLE audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved', 'denied')),
  details TEXT NOT NULL
);

CREATE INDEX idx_audit_agent ON audit_entries(agent);
CREATE INDEX idx_audit_status ON audit_entries(status);
```

### Module: `packages/core/src/db/`

- `database.ts` — Opens/creates DB, runs migrations, exports typed access
- `spend-store.ts` — `SpendStore` class: `record()`, `getSpentSince()`, `getByAgent()`
- `audit-store.ts` — `AuditStore` class: `log()`, `getEntries()` with filtering — same public API as current `AuditLogger`

### Integration

- `RulesEngine` constructor accepts optional `SpendStore` — falls back to in-memory if not provided (backward compat for tests)
- `AuditLogger` refactored to use `AuditStore` internally
- Both initialized from DB path, survive server restarts

---

## 2. TUI Architecture

### Navigation Model

Main menu → drill into screen → Escape to go back.

No sidebar or tabs. Simple, works in narrow terminals, matches standard CLI tool patterns (lazygit, k9s).

### Access Model

Two levels of access:

- **Admin operations** (master vault password only) — All TUI screens, audit viewing, agent management, key management. No agent vault key needed.
- **Agent operations** (agent vault key) — MCP tool calls that access chain/secrets. Only used by MCP server, never by TUI directly.

The TUI is purely an admin interface — it uses `MasterVault` and `AgentVaultManager` directly.

### Entry Point

- `chainvault` (no args) → launches TUI
- `chainvault <command>` → direct CLI commands (same as V1)
- Both coexist in same binary

### Component Tree

```
App (Ink root)
├── PasswordPrompt
│     Shown on launch. Masked text input.
│     On success: unlocks MasterVault, shows MainMenu.
│     Re-shown when auto-lock triggers.
│
├── MainMenu
│     List of 6 screens. Arrow keys to navigate, Enter to select.
│     Shows vault status in header (locked/unlocked, agent count).
│
└── ActiveScreen (based on selection)
    ├── Dashboard     — vault status, MCP server status, agent count, recent audit entries
    ├── KeysScreen    — table of keys (name, address, chains). Add/remove actions.
    ├── AgentsScreen  — table of agents (name, chains, allowed types). Create/configure/rotate/revoke.
    ├── ServicesScreen — API keys (name, base_url) and RPC endpoints. Add/remove.
    ├── LogsScreen    — scrollable audit log. Filter by agent, status. Reads from SQLite.
    └── RulesScreen   — select agent → guided editor for chain access, tx types, limits, contract rules.
```

### Auto-Lock

- 15-minute inactivity timer (configurable)
- Any keypress resets the timer
- When triggered: `vault.lock()`, show PasswordPrompt again
- State preserved: when re-unlocked, user returns to the screen they were on

### New CLI Dependencies

```
ink-text-input    — password prompts, form fields
ink-select-input  — menu navigation, selections
ink-spinner       — loading states during vault ops
ink-table         — displaying keys, agents, logs
```

---

## 3. Screen Details

### Dashboard
- Vault status: locked/unlocked, path, vault file size
- Agent summary: count, list of names with chain access
- Recent activity: last 10 audit entries from SQLite
- View-only, no mutations

### Keys Screen
- Table: name | address | chains
- Actions: `a` to add (prompts for name, private key masked, chain IDs), `d` to delete (confirm), `Enter` for details
- Private keys are NEVER displayed — only addresses

### Agents Screen
- Table: name | chains | tx types | key count
- Actions: `a` to create (guided prompts for name, chains, rules), `r` to rotate key, `d` to revoke (confirm), `Enter` for full config view
- Creating an agent displays the vault key ONCE and warns to save it

### Services Screen
- Two sections: API Keys and RPC Endpoints
- API keys table: name | base_url (key value hidden)
- RPC table: name | url | chain_id
- Actions: `a` to add, `d` to remove

### Logs Screen
- Scrollable list of audit entries from SQLite
- Filter bar: by agent name, by status (approved/denied/all)
- Each entry shows: timestamp | agent | action | chain | status | details
- Arrow keys to scroll, `f` to change filter

### Rules Screen
- Select an agent first
- Then guided editor for each rule category:
  - Allowed chains (multi-select from available)
  - Allowed tx types (multi-select: deploy, write, transfer, read, simulate)
  - Spend limits per chain (input fields for max_per_tx, daily, monthly)
  - Contract rules (none / whitelist / blacklist + address list)
  - API access (service name, allowed endpoints, rate limits)
- Changes saved to master vault on confirm

---

## 4. Spend Tracking Flow

```
Agent request
  → RulesEngine.checkTxRequest()
    → checkSpendLimits()
      → SpendStore.getSpentSince(agentName, chainId, since)
        → SELECT SUM(amount) FROM spend_records
           WHERE agent_name = ? AND chain_id = ? AND timestamp > ?

Tx succeeds
  → RulesEngine.recordSpend()
    → SpendStore.record(agentName, chainId, amount)
      → INSERT INTO spend_records VALUES(...)
```

Spend totals survive server restarts. Dashboard and Logs screens can also query spend data for display.

---

## 5. Key Design Decisions

1. **SQLite over flat files** — Handles concurrent writes, proper querying, reusable for future features.
2. **Main menu + drill-in over sidebar** — Simpler to build, works in narrow terminals.
3. **Admin vs agent access** — TUI only needs master vault password. Agent vault keys are for MCP tool calls only.
4. **Auto-lock with state preservation** — Re-unlock returns to previous screen, not back to menu.
5. **better-sqlite3 (sync) over sql.js (async)** — No async overhead, faster, native bindings.
6. **RulesEngine backward compat** — SpendStore is optional parameter, tests still work with in-memory fallback.
