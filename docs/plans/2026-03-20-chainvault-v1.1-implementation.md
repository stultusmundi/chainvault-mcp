# ChainVault MCP V1.1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add interactive TUI for vault administration and persistent spend tracking backed by SQLite.

**Architecture:** SQLite database layer in `@chainvault/core` for spend records and audit entries. Ink/React TUI in `@chainvault/cli` with main-menu navigation, 6 admin screens, masked password prompt, and 15-minute auto-lock. The TUI uses only admin-level access (master vault password) — agent vault keys are for MCP tools only.

**Tech Stack:** `better-sqlite3` for SQLite, `ink` 5.x + `react` 18.x for TUI, `ink-text-input`/`ink-select-input`/`ink-spinner`/`ink-table` for UI components, `vitest` for testing.

**Design Doc:** `docs/plans/2026-03-20-chainvault-v1.1-design.md`

---

## Development Process Rules

Same rules as V1 apply. Read `CLAUDE.md` before starting. Check `git log` and `git status`. Run `npx vitest run` and `npx tsc --noEmit` after each task. Commit frequently.

---

## Task 1: SQLite Database Setup

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/src/db/database.ts`
- Create: `packages/core/src/db/database.test.ts`

**Step 1: Add `better-sqlite3` dependency**

Run: `npm install -w packages/core better-sqlite3 && npm install -w packages/core -D @types/better-sqlite3`

**Step 2: Write failing tests for database module**

```typescript
// packages/core/src/db/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';

describe('ChainVaultDB', () => {
  let testDir: string;
  let db: ChainVaultDB;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-db-'));
    db = new ChainVaultDB(testDir);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates database file', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(testDir, 'chainvault.db'))).toBe(true);
  });

  it('creates spend_records table', () => {
    const tables = db.getDB().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='spend_records'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates audit_entries table', () => {
    const tables = db.getDB().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_entries'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('close is idempotent', () => {
    db.close();
    db.close(); // should not throw
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/db/database.test.ts`
Expected: FAIL — module does not exist.

**Step 4: Implement database module**

```typescript
// packages/core/src/db/database.ts
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DB_FILENAME = 'chainvault.db';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS spend_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    timestamp INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_spend_agent_chain
    ON spend_records(agent_name, chain_id, timestamp)`,
  `CREATE TABLE IF NOT EXISTS audit_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent TEXT NOT NULL,
    action TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('approved', 'denied')),
    details TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_entries(agent)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_entries(status)`,
];

export class ChainVaultDB {
  private db: DatabaseType;

  constructor(basePath: string) {
    mkdirSync(basePath, { recursive: true });
    this.db = new Database(join(basePath, DB_FILENAME));
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();
  }

  private runMigrations(): void {
    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
  }

  getDB(): DatabaseType {
    return this.db;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/db/database.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add packages/core/package.json packages/core/src/db/ package-lock.json
git commit -m "feat(db): add SQLite database layer with spend and audit tables"
```

---

## Task 2: Spend Store

**Files:**
- Create: `packages/core/src/db/spend-store.ts`
- Create: `packages/core/src/db/spend-store.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/core/src/db/spend-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';
import { SpendStore } from './spend-store.js';

describe('SpendStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let store: SpendStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-spend-'));
    db = new ChainVaultDB(testDir);
    store = new SpendStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('records a spend', () => {
    store.record('deployer', 11155111, 0.5);
    const total = store.getSpentSince('deployer', 11155111, 0);
    expect(total).toBe(0.5);
  });

  it('accumulates multiple spends', () => {
    store.record('deployer', 11155111, 0.5);
    store.record('deployer', 11155111, 0.3);
    const total = store.getSpentSince('deployer', 11155111, 0);
    expect(total).toBeCloseTo(0.8);
  });

  it('filters by agent name', () => {
    store.record('deployer', 11155111, 1.0);
    store.record('reader', 11155111, 2.0);
    expect(store.getSpentSince('deployer', 11155111, 0)).toBe(1.0);
    expect(store.getSpentSince('reader', 11155111, 0)).toBe(2.0);
  });

  it('filters by chain id', () => {
    store.record('deployer', 1, 1.0);
    store.record('deployer', 11155111, 2.0);
    expect(store.getSpentSince('deployer', 1, 0)).toBe(1.0);
    expect(store.getSpentSince('deployer', 11155111, 0)).toBe(2.0);
  });

  it('filters by timestamp', () => {
    const now = Date.now();
    store.record('deployer', 1, 1.0);
    expect(store.getSpentSince('deployer', 1, now + 100000)).toBe(0);
  });

  it('returns 0 for no records', () => {
    expect(store.getSpentSince('nobody', 1, 0)).toBe(0);
  });

  it('persists across SpendStore instances', () => {
    store.record('deployer', 1, 1.5);
    const store2 = new SpendStore(db);
    expect(store2.getSpentSince('deployer', 1, 0)).toBe(1.5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/db/spend-store.test.ts`
Expected: FAIL.

**Step 3: Implement SpendStore**

```typescript
// packages/core/src/db/spend-store.ts
import type { ChainVaultDB } from './database.js';

export class SpendStore {
  private db: ChainVaultDB;

  constructor(db: ChainVaultDB) {
    this.db = db;
  }

  record(agentName: string, chainId: number, amount: number): void {
    this.db.getDB().prepare(
      'INSERT INTO spend_records (agent_name, chain_id, amount, timestamp) VALUES (?, ?, ?, ?)'
    ).run(agentName, chainId, amount, Date.now());
  }

  getSpentSince(agentName: string, chainId: number, since: number): number {
    const result = this.db.getDB().prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM spend_records WHERE agent_name = ? AND chain_id = ? AND timestamp > ?'
    ).get(agentName, chainId, since) as { total: number };
    return result.total;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/db/spend-store.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/db/spend-store.ts packages/core/src/db/spend-store.test.ts
git commit -m "feat(db): add SpendStore with SQLite-backed spend tracking"
```

---

## Task 3: Audit Store

**Files:**
- Create: `packages/core/src/db/audit-store.ts`
- Create: `packages/core/src/db/audit-store.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/core/src/db/audit-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';
import { AuditStore, type AuditEntry } from './audit-store.js';

describe('AuditStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let store: AuditStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-audit-store-'));
    db = new ChainVaultDB(testDir);
    store = new AuditStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('logs an entry and retrieves it', () => {
    store.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'Deployed to Sepolia',
    });

    const entries = store.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('deployer');
    expect(entries[0].status).toBe('approved');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('accumulates entries', () => {
    store.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'b', action: 'write', chain_id: 1, status: 'denied', details: '' });
    expect(store.getEntries()).toHaveLength(2);
  });

  it('filters by agent', () => {
    store.log({ agent: 'deployer', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'reader', action: 'read', chain_id: 1, status: 'approved', details: '' });
    const filtered = store.getEntries({ agent: 'deployer' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].agent).toBe('deployer');
  });

  it('filters by status', () => {
    store.log({ agent: 'a', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'a', action: 'write', chain_id: 1, status: 'denied', details: '' });
    const denied = store.getEntries({ status: 'denied' });
    expect(denied).toHaveLength(1);
  });

  it('returns entries with limit', () => {
    for (let i = 0; i < 20; i++) {
      store.log({ agent: 'a', action: `action-${i}`, chain_id: 1, status: 'approved', details: '' });
    }
    const limited = store.getEntries({}, 10);
    expect(limited).toHaveLength(10);
  });

  it('persists across instances', () => {
    store.log({ agent: 'a', action: 'test', chain_id: 1, status: 'approved', details: 'persist' });
    const store2 = new AuditStore(db);
    expect(store2.getEntries()).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/db/audit-store.test.ts`
Expected: FAIL.

**Step 3: Implement AuditStore**

```typescript
// packages/core/src/db/audit-store.ts
import type { ChainVaultDB } from './database.js';

export interface AuditEntry {
  timestamp: string;
  agent: string;
  action: string;
  chain_id: number;
  status: 'approved' | 'denied';
  details: string;
}

type LogInput = Omit<AuditEntry, 'timestamp'>;

interface FilterOptions {
  agent?: string;
  status?: 'approved' | 'denied';
}

export class AuditStore {
  private db: ChainVaultDB;

  constructor(db: ChainVaultDB) {
    this.db = db;
  }

  log(entry: LogInput): void {
    this.db.getDB().prepare(
      'INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      new Date().toISOString(),
      entry.agent,
      entry.action,
      entry.chain_id,
      entry.status,
      entry.details,
    );
  }

  getEntries(filter?: FilterOptions, limit?: number): AuditEntry[] {
    let sql = 'SELECT timestamp, agent, action, chain_id, status, details FROM audit_entries WHERE 1=1';
    const params: any[] = [];

    if (filter?.agent) {
      sql += ' AND agent = ?';
      params.push(filter.agent);
    }
    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY id DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    return this.db.getDB().prepare(sql).all(...params) as AuditEntry[];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/db/audit-store.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/db/audit-store.ts packages/core/src/db/audit-store.test.ts
git commit -m "feat(db): add AuditStore with SQLite-backed audit logging"
```

---

## Task 4: Integrate SpendStore into RulesEngine

**Files:**
- Modify: `packages/core/src/rules/engine.ts`
- Modify: `packages/core/src/rules/engine.test.ts`

**Step 1: Add new tests for SpendStore integration**

Append to `packages/core/src/rules/engine.test.ts` — add imports for `mkdtemp`, `rm`, `tmpdir`, `join`, `ChainVaultDB`, `SpendStore`, `beforeEach`, `afterEach`. Add a new describe block:

```typescript
describe('RulesEngine with SpendStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let spendStore: SpendStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-rules-db-'));
    db = new ChainVaultDB(testDir);
    spendStore = new SpendStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('uses SpendStore for persistent spend tracking', () => {
    const engine = new RulesEngine(DEPLOYER_CONFIG, { spendStore, agentName: 'deployer' });
    engine.recordSpend(11155111, 4.5);

    const engine2 = new RulesEngine(DEPLOYER_CONFIG, { spendStore, agentName: 'deployer' });
    const result = engine2.checkTxRequest({
      type: 'write',
      chain_id: 11155111,
      value: '1.0',
    });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('daily limit');
  });

  it('falls back to in-memory when no SpendStore provided', () => {
    const engine = new RulesEngine(DEPLOYER_CONFIG);
    engine.recordSpend(11155111, 4.5);
    const result = engine.checkTxRequest({
      type: 'write',
      chain_id: 11155111,
      value: '1.0',
    });
    expect(result.approved).toBe(false);
  });
});
```

**Step 2: Run tests to verify new ones fail**

Run: `npx vitest run packages/core/src/rules/engine.test.ts`
Expected: New tests FAIL.

**Step 3: Modify RulesEngine**

Update constructor to accept optional `SpendStore`. Update `recordSpend` and `getSpentSince` to use SpendStore when available, falling back to in-memory Map.

Add import: `import type { SpendStore } from '../db/spend-store.js';`

Add options interface and update constructor:
```typescript
interface RulesEngineOptions {
  spendStore?: SpendStore;
  agentName?: string;
}
```

Constructor becomes: `constructor(config: AgentConfig, options?: RulesEngineOptions)`

`recordSpend` delegates to `spendStore.record()` or in-memory map.
`getSpentSince` delegates to `spendStore.getSpentSince()` or in-memory map.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/rules/engine.test.ts`
Expected: ALL tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/rules/engine.ts packages/core/src/rules/engine.test.ts
git commit -m "feat(rules): integrate SpendStore for persistent spend tracking"
```

---

## Task 5: Update Core Barrel Exports

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add db module exports**

```typescript
// Database
export { ChainVaultDB } from './db/database.js';
export { SpendStore } from './db/spend-store.js';
export { AuditStore } from './db/audit-store.js';
export type { AuditEntry } from './db/audit-store.js';
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean.

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export database modules from barrel"
```

---

## Task 6: Install TUI Dependencies

**Files:**
- Modify: `packages/cli/package.json`

**Step 1: Install**

Run: `npm install -w packages/cli ink-text-input ink-select-input ink-spinner ink-table`

**Step 2: Verify**

Run: `npm ls ink-text-input ink-select-input ink-spinner ink-table 2>&1`
Expected: Packages listed.

**Step 3: Commit**

```bash
git add packages/cli/package.json package-lock.json
git commit -m "chore(cli): add TUI dependencies"
```

---

## Task 7: PasswordPrompt Component

**Files:**
- Create: `packages/cli/src/tui/components/PasswordPrompt.tsx`
- Create: `packages/cli/src/tui/components/PasswordPrompt.test.ts`

**Step 1: Write failing test**

```typescript
// packages/cli/src/tui/components/PasswordPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { validatePassword } from './PasswordPrompt.js';

describe('validatePassword', () => {
  it('rejects empty password', () => {
    expect(validatePassword('')).toBe('Password cannot be empty');
  });

  it('accepts non-empty password', () => {
    expect(validatePassword('test')).toBe(null);
  });
});
```

**Step 2: Run test — FAIL**

**Step 3: Implement PasswordPrompt**

React component with masked input using `useInput`. Exports `validatePassword` for testing.

```tsx
// packages/cli/src/tui/components/PasswordPrompt.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface PasswordPromptProps {
  onSubmit: (password: string) => void;
  error?: string;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password cannot be empty';
  return null;
}

export function PasswordPrompt({ onSubmit, error }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.return) {
      const err = validatePassword(password);
      if (err) { setValidationError(err); return; }
      onSubmit(password);
      return;
    }
    if (key.backspace || key.delete) {
      setPassword((prev) => prev.slice(0, -1));
      setValidationError(null);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setPassword((prev) => prev + input);
      setValidationError(null);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>ChainVault</Text>
      <Text> </Text>
      <Text>Enter master vault password:</Text>
      <Box>
        <Text>{'> '}</Text>
        <Text>{'*'.repeat(password.length)}</Text>
        <Text dimColor>{'█'}</Text>
      </Box>
      {(error || validationError) && (
        <Text color="red">{error || validationError}</Text>
      )}
    </Box>
  );
}
```

**Step 4: Run test — PASS**

**Step 5: Commit**

```bash
git add packages/cli/src/tui/
git commit -m "feat(tui): add PasswordPrompt component with masked input"
```

---

## Task 8: MainMenu Component

**Files:**
- Create: `packages/cli/src/tui/components/MainMenu.tsx`

**Step 1: Implement MainMenu**

Arrow key navigation, Enter to select, q to quit. Shows vault summary in header.

```tsx
// packages/cli/src/tui/components/MainMenu.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type Screen = 'dashboard' | 'keys' | 'agents' | 'services' | 'logs' | 'rules';

const MENU_ITEMS: { label: string; value: Screen; icon: string }[] = [
  { label: 'Dashboard', value: 'dashboard', icon: '>' },
  { label: 'Keys', value: 'keys', icon: '>' },
  { label: 'Agents', value: 'agents', icon: '>' },
  { label: 'Services', value: 'services', icon: '>' },
  { label: 'Logs', value: 'logs', icon: '>' },
  { label: 'Rules', value: 'rules', icon: '>' },
];

interface MainMenuProps {
  agentCount: number;
  keyCount: number;
  onSelect: (screen: Screen) => void;
}

export function MainMenu({ agentCount, keyCount, onSelect }: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex((i) => (i > 0 ? i - 1 : MENU_ITEMS.length - 1));
    if (key.downArrow) setSelectedIndex((i) => (i < MENU_ITEMS.length - 1 ? i + 1 : 0));
    if (key.return) onSelect(MENU_ITEMS[selectedIndex].value);
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>ChainVault MCP</Text>
        <Text dimColor> — {keyCount} keys, {agentCount} agents</Text>
      </Box>
      {MENU_ITEMS.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === selectedIndex ? 'cyan' : undefined} bold={i === selectedIndex}>
            {i === selectedIndex ? '> ' : '  '}{item.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>arrows navigate / Enter select / q quit</Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/cli/src/tui/components/MainMenu.tsx
git commit -m "feat(tui): add MainMenu component with keyboard navigation"
```

---

## Task 9: Dashboard Screen

**Files:**
- Create: `packages/cli/src/tui/screens/Dashboard.tsx`

**Step 1: Implement**

View-only screen showing vault status, resource counts, recent audit entries.

```tsx
// packages/cli/src/tui/screens/Dashboard.tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AuditEntry } from '@chainvault/core';

interface DashboardProps {
  vaultPath: string;
  keyCount: number;
  agentCount: number;
  rpcCount: number;
  recentActivity: AuditEntry[];
  onBack: () => void;
}

export function Dashboard({ vaultPath, keyCount, agentCount, rpcCount, recentActivity, onBack }: DashboardProps) {
  useInput((_input, key) => { if (key.escape) onBack(); });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Dashboard</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Vault: <Text color="green">unlocked</Text></Text>
        <Text>Path:  <Text dimColor>{vaultPath}</Text></Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Resources</Text>
        <Text>  Keys:      {keyCount}</Text>
        <Text>  Agents:    {agentCount}</Text>
        <Text>  Endpoints: {rpcCount}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Recent Activity</Text>
        {recentActivity.length === 0 ? (
          <Text dimColor>  No activity yet</Text>
        ) : (
          recentActivity.slice(0, 10).map((entry, i) => (
            <Text key={i}>
              <Text dimColor>{entry.timestamp.slice(11, 19)} </Text>
              <Text color={entry.status === 'approved' ? 'green' : 'red'}>
                {entry.status === 'approved' ? '+' : 'x'}
              </Text>
              <Text> {entry.agent} {entry.action}</Text>
            </Text>
          ))
        )}
      </Box>
      <Box marginTop={1}><Text dimColor>Esc back</Text></Box>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/tui/screens/Dashboard.tsx
git commit -m "feat(tui): add Dashboard screen"
```

---

## Task 10: Keys Screen

**Files:**
- Create: `packages/cli/src/tui/screens/KeysScreen.tsx`

**Step 1: Implement**

List keys with add (name → masked private key → chain IDs) and delete actions. Uses `useInput` mode state machine.

The screen accepts `keys`, `onAddKey`, `onRemoveKey`, `onBack` as props. Modes: `list`, `add-name`, `add-key`, `add-chains`, `confirm-delete`. Private key input is masked with `*`.

**Step 2: Commit**

```bash
git add packages/cli/src/tui/screens/KeysScreen.tsx
git commit -m "feat(tui): add Keys screen with add/remove/list"
```

---

## Task 11: Agents, Services, Logs, and Rules Screens

**Files:**
- Create: `packages/cli/src/tui/screens/AgentsScreen.tsx`
- Create: `packages/cli/src/tui/screens/ServicesScreen.tsx`
- Create: `packages/cli/src/tui/screens/LogsScreen.tsx`
- Create: `packages/cli/src/tui/screens/RulesScreen.tsx`

Each screen follows the same pattern as KeysScreen: props for data + callbacks, `useInput` mode state machine, Escape to go back.

**AgentsScreen:** List agents, create (guided prompts), rotate key, revoke. Shows vault key once on create.

**ServicesScreen:** Two sections for API keys and RPC endpoints. Add/remove for both.

**LogsScreen:** Scrollable audit entries from AuditStore. Filter with 'f' key.

**RulesScreen:** Select agent, then edit chain access, tx types, spend limits, contract rules.

**Step 1: Implement all 4 screens**

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/cli/src/tui/screens/
git commit -m "feat(tui): add Agents, Services, Logs, and Rules screens"
```

---

## Task 12: App Root with Auto-Lock

**Files:**
- Create: `packages/cli/src/tui/App.tsx`

**Step 1: Implement App root**

Top-level component managing: vault state (locked/unlocked), screen routing, auto-lock timer (15 min), DB initialization. Shows PasswordPrompt when locked, MainMenu when unlocked with no screen selected, active screen otherwise.

Uses `useRef` for `lastActivity` timestamp, `useEffect` interval to check auto-lock, `useInput` to reset activity on any keypress.

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/cli/src/tui/App.tsx
git commit -m "feat(tui): add App root with auto-lock, screen routing, and vault integration"
```

---

## Task 13: Wire TUI Entry Point

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Update entry point**

When no args provided (`process.argv.length <= 2`), render the Ink `App` component. Otherwise parse with commander as before.

**Step 2: Build and verify**

Run: `npm run build && npx vitest run`

**Step 3: Manual test**

Run: `node packages/cli/dist/index.js`
Expected: Password prompt appears.

**Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): launch TUI when no command args provided"
```

---

## Task 14: Full Verification

**Step 1:** `npx vitest run` — all tests pass
**Step 2:** `npx tsc --noEmit` — no errors
**Step 3:** `npm run build` — clean build
**Step 4:** Manual TUI walkthrough: password → menu → each screen → Escape back
**Step 5:** Update `packages/cli/CLAUDE.md` with TUI conventions if needed

---

## Task Summary

| Task | Module | Description |
|------|--------|-------------|
| 1 | DB | SQLite database setup with migrations |
| 2 | DB | SpendStore with persistent spend tracking |
| 3 | DB | AuditStore with SQLite audit logging |
| 4 | Rules | Integrate SpendStore into RulesEngine |
| 5 | Core | Update barrel exports |
| 6 | CLI | Install TUI dependencies |
| 7 | TUI | PasswordPrompt component |
| 8 | TUI | MainMenu component |
| 9 | TUI | Dashboard screen |
| 10 | TUI | Keys screen |
| 11 | TUI | Agents, Services, Logs, Rules screens |
| 12 | TUI | App root with auto-lock |
| 13 | CLI | Wire TUI entry point |
| 14 | — | Full verification |

## Execution Notes

- Tasks 1-5 are the database layer (critical path)
- Tasks 6-13 are the TUI (depend on DB for Logs/Dashboard)
- Task 11 is the largest — 4 screens, can be split
- Task 14 is the validation gate
