# Workstyle Testing & Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove ChainVault's write path against real chains (anvil, mainnet forks, live testnets), fix the production gaps that testing surfaced, add CI, and ship v1.0 to npm.

**Architecture:** Deterministic tiers are vitest projects under `tests/workstyle/` driven by an `AnvilHarness` + `VaultFixture` (real encrypted vaults, no test backdoors). LLM scenarios extend `tests/agent-e2e`. Foundry provides chains; ChainVault itself is the system under test.

**Tech Stack:** TypeScript, vitest 3.2 projects, Foundry (anvil), `node:sqlite`, viem, `@modelcontextprotocol/sdk`, `@anthropic-ai/claude-agent-sdk`, GitHub Actions.

**Design doc:** `docs/plans/2026-07-18-workstyle-testing-and-roadmap-design.md`

## Global Constraints

- Node engines: `>=22.13.0` after Task 1 (was `>=20.0.0`).
- ES modules everywhere; Zod for all runtime validation; `viem` for EVM.
- Security invariants (CLAUDE.md): secrets never logged/returned/in errors; rules checked BEFORE vault decryption; wipe secrets after use.
- Build is esbuild via `npm run build` (`tsc` OOMs on viem types); type check with `npx tsc --noEmit`.
- Solc version for the corpus: `0.8.24` (constant `SOLC_VERSION` in `tests/workstyle/helpers/corpus.ts`).
- Anvil local chain id: `31337`; anvil account #0 key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.
- Vitest project names: `unit`, `live`, `anvil`, `fork`, `testnet`. PR gate = `unit` + `anvil`; nightly = `live` + `fork` + `testnet` + agent scenarios.
- Commit style: `feat|fix|test|docs|chore(scope): imperative, <72 chars`.
- Workstyle suites must skip gracefully (with a one-line reason) when their prerequisite (anvil binary, solc/Docker, fork URL, testnet key, Anthropic key) is missing.

---

## Chunk W0 — Repo Health

### Task 1: Migrate ChainVaultDB from better-sqlite3 to node:sqlite

**Files:**
- Modify: `packages/core/src/db/database.ts`
- Modify: `packages/core/src/db/spend-store.ts`
- Modify: `packages/core/src/db/audit-store.ts`
- Modify: `package.json`, `packages/core/package.json`, `packages/cli/package.json` (engines; root devDeps)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ChainVaultDB.getDB(): DatabaseSync` (from `node:sqlite`). `SpendStore`/`AuditStore` public APIs unchanged.

- [ ] **Step 1: Baseline — run existing DB tests green**

Run: `npx vitest run packages/core/src/db/`
Expected: PASS (if it fails with `NODE_MODULE_VERSION`, run `npm rebuild better-sqlite3` first — that fragility is exactly what this task removes).

- [ ] **Step 2: Rewrite `database.ts` on `node:sqlite`**

Replace the entire file with:

```typescript
// packages/core/src/db/database.ts
import { DatabaseSync } from 'node:sqlite';
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
  private db: DatabaseSync;

  constructor(basePath: string) {
    mkdirSync(basePath, { recursive: true });
    this.db = new DatabaseSync(join(basePath, DB_FILENAME));
    this.db.exec('PRAGMA journal_mode = WAL');
    this.runMigrations();
  }

  private runMigrations(): void {
    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
  }

  getDB(): DatabaseSync {
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

- [ ] **Step 3: Fix result casts in the stores**

`node:sqlite`'s `get()`/`all()` return `Record<string, SQLOutputValue> | undefined`, so direct casts need `unknown`. In `spend-store.ts` change:

```typescript
    ).get(agentName, chainId, since) as { total: number };
```
to
```typescript
    ).get(agentName, chainId, since) as unknown as { total: number };
```

In `audit-store.ts` apply the same `as unknown as` treatment to every `.get(...)`/`.all(...)` cast (grep: `grep -n "as {" packages/core/src/db/audit-store.ts`).

- [ ] **Step 4: Drop the native dependency, bump engines**

```bash
npm uninstall better-sqlite3 @types/better-sqlite3 -w @chainvault/core
```

In all three `package.json` files (root, `packages/core`, `packages/cli`) set:

```json
  "engines": { "node": ">=22.13.0" }
```

(`packages/*` may not have an `engines` field yet — add it.) In root `devDependencies` bump `"@types/node": "^22.13.0"`, then `npm install`.

- [ ] **Step 5: Verify tests, types, build**

Run: `npx vitest run packages/core/src/db/ packages/core/src/rules/ packages/cli/src/tui/screens/LogsScreen.e2e.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit` → no errors. Run: `npm run build` → succeeds (`node:sqlite` is a builtin; esbuild externalizes `node:*`).
Run: `npx vitest run` → all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(db): migrate to node:sqlite, drop native better-sqlite3 dep"
```

### Task 2: Audit `error` status for handler failures

Handler catch blocks currently log `status: 'approved'` with `details: "Error: …"` — errors masquerade as approvals in the audit log.

**Files:**
- Modify: `packages/core/src/db/database.ts` (schema + rebuild migration)
- Modify: `packages/core/src/db/audit-store.ts`, `packages/core/src/mcp/audit-fn.ts`
- Modify: `packages/core/src/mcp/tools/chain-tools.ts` (+ any other tool file the grep in Step 4 hits)
- Test: `packages/core/src/db/audit-store.test.ts`, `packages/core/src/db/database.test.ts`

**Interfaces:**
- Produces: `AuditEntry.status: 'approved' | 'denied' | 'error'` (used by W5 suites).

- [ ] **Step 1: Write failing tests**

In `audit-store.test.ts` add:

```typescript
it('logs an error status entry', () => {
  store.log({ agent: 'a', action: 'deploy_contract', chain_id: 31337, status: 'error', details: 'RPC unreachable' });
  const rows = store.getEntries({ status: 'error' });
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('error');
});
```

In `database.test.ts` add (uses the temp-dir pattern already in that file):

```typescript
it('rebuilds a pre-error-status audit table in place', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { join } = await import('node:path');
  // Hand-create the OLD schema, with a row, then reopen via ChainVaultDB
  const raw = new DatabaseSync(join(testDir, 'chainvault.db'));
  raw.exec(`CREATE TABLE audit_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, agent TEXT NOT NULL,
    action TEXT NOT NULL, chain_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('approved', 'denied')), details TEXT NOT NULL)`);
  raw.exec(`INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details)
    VALUES ('t', 'a', 'x', 1, 'approved', 'd')`);
  raw.close();

  const upgraded = new ChainVaultDB(testDir);
  upgraded.getDB().prepare(
    `INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details)
     VALUES ('t2', 'a', 'x', 1, 'error', 'boom')`,
  ).run();
  const count = upgraded.getDB().prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as unknown as { c: number };
  expect(count.c).toBe(2);
  upgraded.close();
});
```

Run: `npx vitest run packages/core/src/db/` — Expected: both new tests FAIL (type error on `'error'` / CHECK constraint violation).

- [ ] **Step 2: Implement schema change + rebuild migration**

In `database.ts`: change the `audit_entries` CHECK in `MIGRATIONS` to
`CHECK(status IN ('approved', 'denied', 'error'))`, and in the constructor call `this.rebuildAuditTableIfNeeded();` **before** `this.runMigrations();`. Add:

```typescript
  /** Pre-1.0 DBs constrained status to approved/denied; rebuild in place to allow 'error'. */
  private rebuildAuditTableIfNeeded(): void {
    const row = this.db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_entries'`)
      .get() as unknown as { sql: string } | undefined;
    if (!row || row.sql.includes(`'error'`)) return;
    this.db.exec(`
      BEGIN;
      ALTER TABLE audit_entries RENAME TO audit_entries_old;
      CREATE TABLE audit_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent TEXT NOT NULL,
        action TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('approved', 'denied', 'error')),
        details TEXT NOT NULL
      );
      INSERT INTO audit_entries SELECT * FROM audit_entries_old;
      DROP TABLE audit_entries_old;
      COMMIT;
    `);
  }
```

- [ ] **Step 3: Widen the status type**

In `audit-store.ts`: `status: 'approved' | 'denied' | 'error'` on `AuditEntry` and on `FilterOptions.status`. In `mcp/audit-fn.ts` widen the `status` field of the audit entry type the same way.

- [ ] **Step 4: Fix the handler catch blocks**

Find every error path audited as approved:

```bash
grep -rn "status: 'approved', details: \`Error" packages/core/src/mcp/tools/
```

At each hit (there are several in `chain-tools.ts`, e.g. the `deploy_contract` and `interact_contract` catch blocks), change `status: 'approved'` → `status: 'error'`. Example diff shape:

```typescript
      } catch (e: unknown) {
        audit({ action: 'deploy_contract', chain_id, status: 'error', details: `Error: ${sanitizeError(e)}` });
```

Re-run the grep — Expected: zero hits remain.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run` → PASS. `npx tsc --noEmit` → clean.

```bash
git add -A
git commit -m "fix(mcp): audit handler failures as 'error', not 'approved'"
```

### Task 3: Wire persistent SpendStore into the MCP agent context

`RulesEngine` supports a `SpendStore`, but `createAgentContext` never receives one — in production, spend limits silently reset on server restart. This is a security-invariant fix.

**Files:**
- Modify: `packages/core/src/mcp/context.ts`
- Modify: `packages/core/src/mcp/server.ts`
- Test: `packages/core/src/mcp/context.test.ts`

**Interfaces:**
- Produces: `createAgentContext(basePath, vaultKey, options?: { spendStore?: SpendStore })`. Server `init()` constructs DB → SpendStore → context (in that order).

- [ ] **Step 1: Write failing test**

In `context.test.ts` (reuse its existing vault-fixture setup that creates an agent vault in a temp dir; the vault key variable is whatever that file already names it):

```typescript
it('persists spend through the provided SpendStore', async () => {
  const { ChainVaultDB } = await import('../db/database.js');
  const { SpendStore } = await import('../db/spend-store.js');
  const db = new ChainVaultDB(testDir);
  const spendStore = new SpendStore(db);

  const ctx = await createAgentContext(testDir, vaultKey, { spendStore });
  ctx!.rules.recordSpend(11155111, 1.5);

  // A brand-new engine over the same store sees the spend — proves persistence path
  expect(spendStore.getSpentSince(ctx!.agentName, 11155111, 0)).toBe(1.5);
  db.close();
});
```

Run: `npx vitest run packages/core/src/mcp/context.test.ts` — Expected: FAIL (`createAgentContext` takes 2 args).

- [ ] **Step 2: Implement**

`context.ts`: add

```typescript
import type { SpendStore } from '../db/spend-store.js';

export interface AgentContextOptions {
  spendStore?: SpendStore;
}
```

change the signature to `createAgentContext(basePath: string, vaultKey: string | undefined, options?: AgentContextOptions)` and construct the engine as:

```typescript
      const rules = new RulesEngine(vaultData.config, { spendStore: options?.spendStore });
```

`server.ts` `init()`: reorder so the DB exists before the context, and pass the store:

```typescript
  async init(): Promise<void> {
    this.db = new ChainVaultDB(this.config.basePath);
    this.auditStore = new AuditStore(this.db);
    const spendStore = new SpendStore(this.db);

    this.agentContext = await createAgentContext(
      this.config.basePath,
      this.config.vaultKey || process.env.CHAINVAULT_VAULT_KEY,
      { spendStore },
    );
  }
```

(add `import { SpendStore } from '../db/spend-store.js';`).

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run packages/core/src/mcp/` → PASS. Full suite + `npx tsc --noEmit` → clean.

```bash
git add -A
git commit -m "fix(mcp): wire persistent SpendStore into agent context rules engine"
```

### Task 4: Vault RPC endpoint resolution in chain tools

Agent vaults already carry `rpc_endpoints`, and `EvmAdapter.fromChainId(chainId, customRpcUrl?)` accepts an override — but tool handlers never pass one. Wiring this closes a design-compliance gap and is the enabler for all anvil-backed testing (chain 31337 resolves via the vault, not the static registry).

**Files:**
- Modify: `packages/core/src/mcp/context.ts`
- Modify: `packages/core/src/mcp/tools/chain-tools.ts`
- Test: `packages/core/src/mcp/context.test.ts`

**Interfaces:**
- Produces: `AgentContext.getRpcUrlForChain(chainId: number): string | null`. Resolution order everywhere: vault endpoint → static registry → error.

- [ ] **Step 1: Write failing test**

In `context.test.ts` (the fixture's master vault setup gains `await vault.addRpcEndpoint('local-anvil', 'http://127.0.0.1:9999', 31337);` before agent creation, and the agent config's `chains` must include `31337` so the endpoint is copied in — mirror however the existing fixture builds its agent):

```typescript
it('resolves RPC URLs from the agent vault endpoints', async () => {
  const ctx = await createAgentContext(testDir, vaultKey);
  expect(ctx!.getRpcUrlForChain(31337)).toBe('http://127.0.0.1:9999');
  expect(ctx!.getRpcUrlForChain(1)).toBeNull();
});
```

Run: `npx vitest run packages/core/src/mcp/context.test.ts` — Expected: FAIL (method missing).

- [ ] **Step 2: Implement the accessor**

In `context.ts`, add to the `AgentContext` interface:

```typescript
  getRpcUrlForChain(chainId: number): string | null;
```

and inside the closure block (next to `getPrivateKeyForChain`):

```typescript
      const getRpcUrlForChain = (chainId: number): string | null => {
        for (const ep of Object.values(vaultData.rpc_endpoints)) {
          if (ep.chain_id === chainId) return ep.url;
        }
        return null;
      };
```

Include `getRpcUrlForChain` in the returned object.

- [ ] **Step 3: Pass it at every adapter construction site**

```bash
grep -n "EvmAdapter.fromChainId(chain_id)" packages/core/src/mcp/tools/chain-tools.ts
```

At every hit change to (in read handlers where `ctx` may be null, and write handlers where `ctx!` is established):

```typescript
        const adapter = EvmAdapter.fromChainId(chain_id, ctx?.getRpcUrlForChain(chain_id) ?? undefined);
```

Re-run the grep — Expected: zero bare `fromChainId(chain_id)` calls remain. Also grep the other tool files (`vault-tools.ts`, `proxy-tools.ts`) for `fromChainId` and apply the same change at any hit.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run` → PASS. `npx tsc --noEmit` → clean.

```bash
git add -A
git commit -m "feat(mcp): resolve RPC URLs from agent vault endpoints"
```

### Task 5: Housekeeping

**Files:**
- Modify: `README.md`, `.gitignore`

- [ ] **Step 1: Branch and PR cleanup**

```bash
git branch -d feat/chainvault-core feat/cli-commands-complete feat/e2e_tests \
  feat/mcp-tier2-tier3 feat/mcp-tool-wiring feat/v1.1-tui-sqlite \
  feat/v1.1-webauthn-compiler fix/security-hardening
git push origin --delete feat/chainvault-core feat/cli-commands-complete feat/e2e_tests \
  feat/mcp-tier2-tier3 feat/mcp-tool-wiring feat/v1.1-tui-sqlite \
  feat/v1.1-webauthn-compiler fix/security-hardening
gh pr list --state open   # if PR #7 still shows open, close it:
gh pr close 7 --comment "Superseded — merged to main via later PRs."
```

- [ ] **Step 2: README badge + gitignore**

In `README.md` replace the hardcoded tests badge line with the current count from `npx vitest run` (as of planning: 468):
`![Tests: 468 passing](https://img.shields.io/badge/Tests-468%20passing-brightgreen.svg)`
(Task 26 later replaces this with a live CI badge.) Append `.DS_Store` to `.gitignore` and run `git rm --cached .DS_Store` if tracked.

- [ ] **Step 3: Commit**

```bash
git add README.md .gitignore
git commit -m "chore: housekeeping — branches, README badge, gitignore"
```

---

## Chunk W1 — CI

### Task 6: Split vitest into `unit` and `live` projects

**Files:**
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `npx vitest run --project unit` (offline, PR-gating) and `--project live` (public-RPC reads, nightly). Later tasks add `anvil`, `fork`, `testnet` projects to the same array.

- [ ] **Step 1: Restructure the config**

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@chainvault/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/core/src/chain/e2e.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'live',
          include: ['packages/core/src/chain/e2e.test.ts'],
        },
      },
    ],
  },
});
```

- [ ] **Step 2: Verify the split**

Run: `npx vitest run --project unit` — Expected: passes, does **not** run `chain/e2e.test.ts`.
Run: `npx vitest run --project live` — Expected: runs only `chain/e2e.test.ts` (needs network).
Run: `npx vitest run` — Expected: all projects run (unchanged local default).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: split vitest into unit and live projects"
```

### Task 7: PR-gating CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['22.x', '24.x']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
      - run: npx vitest run --project unit
```

(The `workstyle` anvil job is appended in Task 12 once that project exists.)

- [ ] **Step 2: Push on a branch and verify**

```bash
git checkout -b ci/workflows
git add .github/workflows/ci.yml
git commit -m "chore(ci): add PR-gating unit workflow"
git push -u origin ci/workflows
gh pr create --fill
gh pr checks --watch
```

Expected: both matrix legs green. Merge the PR (`gh pr merge --squash`), return to main, pull.

### Task 8: Nightly workflow (live tier)

**Files:**
- Create: `.github/workflows/nightly.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Nightly

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  live-rpc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
      - run: npm ci
      - run: npx vitest run --project live
      - name: Open issue on failure
        if: failure()
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh issue create \
            --title "Nightly live-RPC run failed ($(date -u +%F))" \
            --body "Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
            --label nightly-failure || true
```

(Fork, testnet, and scenario jobs are appended by Tasks 22, 23, 24.)

- [ ] **Step 2: Verify by manual dispatch, then commit via PR as in Task 7**

```bash
git add .github/workflows/nightly.yml
git commit -m "chore(ci): add nightly live-RPC workflow"
# push, PR, merge; then:
gh workflow run Nightly && gh run watch
```

Expected: `live-rpc` job green.

---

## Chunk W2 — Workstyle Test Infrastructure

### Task 9: AnvilHarness + smoke suite + `anvil` vitest project

**Files:**
- Create: `tests/workstyle/helpers/anvil.ts`
- Create: `tests/workstyle/anvil-smoke.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `AnvilHarness.start(opts?): Promise<AnvilHarness>` with `rpcUrl`, `chainId`, `rpc(method, params)`, `snapshot()`, `revert(id)`, `setBalance(addr, wei)`, `impersonate(addr)`, `stop()`. `ANVIL_ACCOUNTS: {address, privateKey}[]`, `ANVIL_CHAIN_ID = 31337`, `anvilAvailable(): boolean`. All later workstyle tasks consume these.

- [ ] **Step 1: Write the harness**

```typescript
// tests/workstyle/helpers/anvil.ts
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

export interface AnvilAccount {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

/** First three accounts of anvil's default mnemonic ("test test ... junk"). */
export const ANVIL_ACCOUNTS: AnvilAccount[] = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
];

export const ANVIL_CHAIN_ID = 31337;

export function anvilAvailable(): boolean {
  try {
    execFileSync('anvil', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not allocate port')));
      }
    });
  });
}

export interface AnvilOptions {
  forkUrl?: string;
  forkBlock?: number;
  chainId?: number;
}

export class AnvilHarness {
  private proc: ChildProcess;
  readonly rpcUrl: string;
  readonly chainId: number;

  private constructor(proc: ChildProcess, rpcUrl: string, chainId: number) {
    this.proc = proc;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
  }

  static async start(opts: AnvilOptions = {}): Promise<AnvilHarness> {
    const port = await freePort();
    // Fork mode keeps the origin chain id (e.g. 1) unless overridden.
    const chainId = opts.chainId ?? (opts.forkUrl ? 1 : ANVIL_CHAIN_ID);
    const args = ['--port', String(port), '--silent'];
    if (!opts.forkUrl) args.push('--chain-id', String(chainId));
    if (opts.forkUrl) {
      args.push('--fork-url', opts.forkUrl);
      if (opts.forkBlock) args.push('--fork-block-number', String(opts.forkBlock));
    }
    const proc = spawn('anvil', args, { stdio: 'ignore' });
    const harness = new AnvilHarness(proc, `http://127.0.0.1:${port}`, chainId);
    await harness.waitReady(opts.forkUrl ? 60_000 : 15_000);
    return harness;
  }

  private async waitReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.rpc('eth_chainId');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await this.stop();
    throw new Error(`anvil did not become ready within ${timeoutMs}ms`);
  }

  async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }

  async snapshot(): Promise<string> {
    return this.rpc<string>('evm_snapshot');
  }

  async revert(id: string): Promise<void> {
    await this.rpc('evm_revert', [id]);
  }

  async setBalance(address: string, wei: bigint): Promise<void> {
    await this.rpc('anvil_setBalance', [address, '0x' + wei.toString(16)]);
  }

  async impersonate(address: string): Promise<void> {
    await this.rpc('anvil_impersonateAccount', [address]);
  }

  async stop(): Promise<void> {
    if (this.proc.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => this.proc.once('exit', () => resolve()));
    this.proc.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }
}
```

- [ ] **Step 2: Register the `anvil` project**

In `vitest.config.ts`, append to the `projects` array:

```typescript
      {
        extends: true,
        test: {
          name: 'anvil',
          include: ['tests/workstyle/**/*.test.ts'],
          exclude: ['tests/workstyle/fork/**', 'tests/workstyle/testnet/**'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
```

- [ ] **Step 3: Write the smoke test**

```typescript
// tests/workstyle/anvil-smoke.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvmAdapter } from '@chainvault/core';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';

describe.skipIf(!anvilAvailable())('AnvilHarness smoke', () => {
  let anvil: AnvilHarness;

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('reports the configured chain id', async () => {
    const chainIdHex = await anvil.rpc<string>('eth_chainId');
    expect(parseInt(chainIdHex, 16)).toBe(ANVIL_CHAIN_ID);
  });

  it('EvmAdapter reads a funded default account balance', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const balance = await adapter.getBalance(ANVIL_ACCOUNTS[0].address);
    expect(BigInt(balance.wei)).toBe(10_000n * 10n ** 18n); // anvil default: 10,000 ETH
  });

  it('setBalance takes effect', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    await anvil.setBalance('0x00000000000000000000000000000000000000AA', 5n * 10n ** 18n);
    const balance = await adapter.getBalance('0x00000000000000000000000000000000000000AA');
    expect(balance.formatted).toBe('5');
  });

  it('snapshot/revert round-trips state', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const snap = await anvil.snapshot();
    await anvil.setBalance('0x00000000000000000000000000000000000000BB', 1n * 10n ** 18n);
    await anvil.revert(snap);
    const balance = await adapter.getBalance('0x00000000000000000000000000000000000000BB');
    expect(balance.wei).toBe('0');
  });
});
```

Note: if `getBalance` formats `5` ETH as `'5.0'` rather than `'5'` (viem `formatEther` returns `'5'`), adjust the assertion to the observed value — assert on `wei` if in doubt.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run --project anvil`
Expected: 4 tests PASS (or the whole describe SKIPs on a machine without anvil).
Run: `npx vitest run --project unit` — Expected: unchanged, workstyle files not picked up.

```bash
git add tests/workstyle vitest.config.ts
git commit -m "test(workstyle): add AnvilHarness, smoke suite, anvil vitest project"
```

### Task 10: VaultFixture

**Files:**
- Create: `tests/workstyle/helpers/vault-fixture.ts`
- Create: `tests/workstyle/vault-fixture.test.ts`

**Interfaces:**
- Consumes: `ANVIL_ACCOUNTS`, `ANVIL_CHAIN_ID` (Task 9); `MasterVault`, `AgentVaultManager`, `AgentConfig` from `@chainvault/core`.
- Produces: `createVaultFixture(opts): Promise<VaultFixture>` where `VaultFixture = { basePath, password, vaultKeys: Record<string,string>, cleanup(): Promise<void> }` and `FixtureAgentSpec` (name, chains?, allowedTypes?, limits?, contractRules?, grantKeys?, grantApis?). All later workstyle tasks consume this.

- [ ] **Step 1: Write the fixture**

```typescript
// tests/workstyle/helpers/vault-fixture.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault, AgentVaultManager, type AgentConfig } from '@chainvault/core';
import { ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './anvil.js';

export interface FixtureAgentSpec {
  name: string;
  chains?: number[];
  allowedTypes?: Array<'deploy' | 'write' | 'transfer' | 'read' | 'simulate'>;
  limits?: Record<string, { max_per_tx: string; daily_limit: string; monthly_limit: string }>;
  contractRules?: AgentConfig['contract_rules'];
  grantKeys?: string[];
  grantApis?: string[];
}

export interface VaultFixtureOptions {
  rpcUrl: string;
  chainId?: number;
  /** Extra API keys to add to the master vault: name -> { key, baseUrl } */
  apiKeys?: Record<string, { key: string; baseUrl: string }>;
  agents?: FixtureAgentSpec[];
}

export interface VaultFixture {
  basePath: string;
  password: string;
  vaultKeys: Record<string, string>;
  cleanup(): Promise<void>;
}

export const FIXTURE_PASSWORD = 'workstyle-test-password';

export async function createVaultFixture(opts: VaultFixtureOptions): Promise<VaultFixture> {
  const chainId = opts.chainId ?? ANVIL_CHAIN_ID;
  const basePath = await mkdtemp(join(tmpdir(), 'chainvault-workstyle-'));

  await MasterVault.init(basePath, FIXTURE_PASSWORD);
  const vault = await MasterVault.unlock(basePath, FIXTURE_PASSWORD);
  try {
    await vault.addKey('anvil-0', ANVIL_ACCOUNTS[0].privateKey, [chainId]);
    await vault.addRpcEndpoint('workstyle-rpc', opts.rpcUrl, chainId);
    for (const [name, api] of Object.entries(opts.apiKeys ?? {})) {
      await vault.addApiKey(name, api.key, api.baseUrl);
    }

    const manager = new AgentVaultManager(basePath, vault);
    const vaultKeys: Record<string, string> = {};
    const agents = opts.agents ?? [{ name: 'workstyle-agent' }];

    for (const spec of agents) {
      const config: AgentConfig = {
        name: spec.name,
        chains: spec.chains ?? [chainId],
        tx_rules: {
          allowed_types: spec.allowedTypes ?? ['deploy', 'write', 'transfer', 'read', 'simulate'],
          limits: spec.limits ?? {},
        },
        api_access: Object.fromEntries(
          (spec.grantApis ?? []).map((api) => [
            api,
            { allowed_endpoints: ['*'], rate_limit: { per_second: 10, daily: 10_000 } },
          ]),
        ),
        contract_rules: spec.contractRules ?? { mode: 'none' },
      };
      const { vaultKey } = await manager.createAgent(
        config,
        spec.grantKeys ?? ['anvil-0'],
        spec.grantApis ?? [],
      );
      vaultKeys[spec.name] = vaultKey;
    }

    return {
      basePath,
      password: FIXTURE_PASSWORD,
      vaultKeys,
      cleanup: async () => {
        await rm(basePath, { recursive: true, force: true });
      },
    };
  } finally {
    vault.lock();
  }
}
```

- [ ] **Step 2: Write the fixture test**

```typescript
// tests/workstyle/vault-fixture.test.ts
import { describe, it, expect } from 'vitest';
import { createAgentContext } from '../../packages/core/src/mcp/context.js';
import { createVaultFixture } from './helpers/vault-fixture.js';
import { ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';

describe('VaultFixture', () => {
  it('creates a working agent vault with key and RPC endpoint', async () => {
    const fixture = await createVaultFixture({ rpcUrl: 'http://127.0.0.1:65001' });
    try {
      const ctx = await createAgentContext(fixture.basePath, fixture.vaultKeys['workstyle-agent']);
      expect(ctx!.agentName).toBe('workstyle-agent');
      expect(ctx!.keys[0].address.toLowerCase()).toBe(ANVIL_ACCOUNTS[0].address.toLowerCase());
      expect(ctx!.getRpcUrlForChain(ANVIL_CHAIN_ID)).toBe('http://127.0.0.1:65001');
      expect(ctx!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBe(ANVIL_ACCOUNTS[0].privateKey);
    } finally {
      await fixture.cleanup();
    }
  });

  it('supports multiple agents with distinct grants', async () => {
    const fixture = await createVaultFixture({
      rpcUrl: 'http://127.0.0.1:65001',
      agents: [
        { name: 'writer' },
        { name: 'reader', allowedTypes: ['read', 'simulate'], grantKeys: [] },
      ],
    });
    try {
      const reader = await createAgentContext(fixture.basePath, fixture.vaultKeys['reader']);
      expect(reader!.keys).toHaveLength(0);
      expect(reader!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run --project anvil` — Expected: PASS (this file needs no anvil binary; it runs in the anvil project regardless).

```bash
git add tests/workstyle
git commit -m "test(workstyle): add VaultFixture builder over real vault APIs"
```

### Task 11: Corpus pipeline + first contract

**Files:**
- Create: `tests/workstyle/contracts/TestToken.sol`
- Create: `tests/workstyle/helpers/corpus.ts`
- Create: `tests/workstyle/corpus.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `compile`, `resolveCompiler`, `CompileResult` from `@chainvault/core`.
- Produces: `SOLC_VERSION = '0.8.24'`, `compileCorpusContract(name): Promise<CompileResult>`, `compilerAvailable(): Promise<boolean>`. Corpus artifacts cached in `tests/workstyle/.artifacts/` (gitignored).

- [ ] **Step 1: Write TestToken.sol (self-contained ERC-20)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Minimal self-contained ERC-20 with constructor args, for workstyle tests.
contract TestToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply) {
        name = name_;
        symbol = symbol_;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "TestToken: insufficient allowance");
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "TestToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
```

- [ ] **Step 2: Write the pipeline**

```typescript
// tests/workstyle/helpers/corpus.ts
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, resolveCompiler, type CompileResult } from '@chainvault/core';

export const SOLC_VERSION = '0.8.24';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(HERE, '..', 'contracts');
const ARTIFACTS_DIR = join(HERE, '..', '.artifacts');

/**
 * Compile a corpus contract by name through ChainVault's own compiler module,
 * with an on-disk cache keyed by solc version + source hash.
 * `contractName` defaults to the file name; pass it explicitly for multi-contract files.
 */
export async function compileCorpusContract(
  fileName: string,
  contractName: string = fileName,
): Promise<CompileResult> {
  const source = await readFile(join(CONTRACTS_DIR, `${fileName}.sol`), 'utf8');
  const hash = createHash('sha256').update(SOLC_VERSION + contractName + source).digest('hex').slice(0, 16);
  const cachePath = join(ARTIFACTS_DIR, `${contractName}.${hash}.json`);

  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as CompileResult;
  } catch {
    // cache miss
  }

  const result = await compile(source, SOLC_VERSION, contractName, true);
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result), 'utf8');
  return result;
}

export async function compilerAvailable(): Promise<boolean> {
  try {
    await resolveCompiler(SOLC_VERSION);
    return true;
  } catch {
    return false;
  }
}
```

Append `tests/workstyle/.artifacts/` to `.gitignore`.

- [ ] **Step 3: Write the pipeline test**

```typescript
// tests/workstyle/corpus.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';

const solcReady = await compilerAvailable();

describe.skipIf(!solcReady)('corpus pipeline', () => {
  it('compiles TestToken to ABI + bytecode', async () => {
    const result = await compileCorpusContract('TestToken');
    const fnNames = result.abi.filter((e: any) => e.type === 'function').map((e: any) => e.name);
    expect(fnNames).toEqual(expect.arrayContaining(['transfer', 'approve', 'transferFrom', 'balanceOf']));
    expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it('caches compiled artifacts on disk', async () => {
    await compileCorpusContract('TestToken');
    const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '.artifacts');
    expect(existsSync(artifactsDir)).toBe(true);
    expect(readdirSync(artifactsDir).some((f) => f.startsWith('TestToken.'))).toBe(true);
    // Second call served from cache (returns identical data without error)
    const again = await compileCorpusContract('TestToken');
    expect(again.bytecode.length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run --project anvil`
Expected: corpus tests PASS (Docker or local solc 0.8.24 present) or SKIP with the compiler unavailable.

```bash
git add tests/workstyle .gitignore
git commit -m "test(workstyle): add corpus compile pipeline dogfooding the compiler module"
```

### Task 12: Scripts, CI anvil job, CLAUDE.md

**Files:**
- Modify: `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`

- [ ] **Step 1: npm script**

Add to root `package.json` scripts:

```json
    "test:workstyle": "vitest run --project anvil",
```

- [ ] **Step 2: CI job**

Append to `.github/workflows/ci.yml` jobs:

```yaml
  workstyle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: stable
      - name: Install solc 0.8.24 (static binary)
        run: |
          curl -sSL -o /usr/local/bin/solc \
            https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.24+commit.e11b9ed9
          chmod +x /usr/local/bin/solc
          solc --version
      - run: npm ci
      - run: npx vitest run --project anvil
```

Record the anvil version the run used (visible in the foundry-toolchain step log); if drift ever breaks the suite, pin `version:` to the last-good release tag.

- [ ] **Step 3: CLAUDE.md quick reference**

In root `CLAUDE.md` under Quick Reference add:

```markdown
- Workstyle tests (needs anvil + solc): `npm run test:workstyle`
- Unit-only (CI PR gate): `npx vitest run --project unit`
```

- [ ] **Step 4: Verify locally, then via PR**

Run: `npm run test:workstyle` — Expected: PASS. Push a PR as in Task 7 and confirm the `workstyle` job is green in Actions.

```bash
git add package.json .github/workflows/ci.yml CLAUDE.md
git commit -m "chore(ci): run anvil workstyle suite on every PR"
```

---

## Chunk W3 — Contract Corpus

### Task 13: Remaining corpus contracts

**Files:**
- Create: `tests/workstyle/contracts/TestNFT.sol`, `PayableVault.sol`, `Reverter.sol`, `EventStorm.sol`, `Factory.sol`, `Counter.sol`, `GasHog.sol`
- Modify: `tests/workstyle/corpus.test.ts`

**Interfaces:**
- Produces: compilable corpus entries `TestNFT`, `PayableVault`, `Reverter`, `EventStorm`, `Factory`, `Child` (in Factory.sol), `CounterV1`, `CounterV2`, `CounterProxy` (in Counter.sol), `GasHog` — consumed by Tasks 14–17 via `compileCorpusContract(file, name?)`.

- [ ] **Step 1: Write the contracts** (all `pragma solidity 0.8.24;`, SPDX MIT header on each)

```solidity
// tests/workstyle/contracts/TestNFT.sol
contract TestNFT {
    string public constant name = "TestNFT";
    string public constant symbol = "TNFT";
    uint256 public nextId;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextId++;
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "TestNFT: not owner");
        require(msg.sender == from, "TestNFT: not authorized");
        ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        emit Transfer(from, to, tokenId);
    }

    function tokenURI(uint256 tokenId) external pure returns (string memory) {
        require(tokenId < type(uint128).max, "TestNFT: bad id");
        return "ipfs://test-nft-metadata";
    }
}
```

```solidity
// tests/workstyle/contracts/PayableVault.sol
contract PayableVault {
    mapping(address => uint256) public deposits;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    function deposit() external payable {
        require(msg.value > 0, "PayableVault: zero deposit");
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    receive() external payable {
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "PayableVault: insufficient deposit");
        deposits[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "PayableVault: transfer failed");
        emit Withdrawn(msg.sender, amount);
    }
}
```

```solidity
// tests/workstyle/contracts/Reverter.sol
contract Reverter {
    error CustomFail(uint256 code, string reason);

    function succeed() external pure returns (bool) {
        return true;
    }

    function failRequire() external pure {
        require(false, "Reverter: require failed as requested");
    }

    function failCustomError() external pure {
        revert CustomFail(42, "custom error as requested");
    }

    function failPanic(uint256 denominator) external pure returns (uint256) {
        return 1 / denominator; // denominator = 0 -> panic 0x12
    }
}
```

```solidity
// tests/workstyle/contracts/EventStorm.sol
contract EventStorm {
    event Ping(address indexed sender, uint256 indexed index, uint256 value);

    function emitMany(uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            emit Ping(msg.sender, i, i * 2);
        }
    }
}
```

```solidity
// tests/workstyle/contracts/Factory.sol
contract Child {
    uint256 public immutable value;
    constructor(uint256 value_) {
        value = value_;
    }
}

contract Factory {
    address[] public children;

    event ChildCreated(address indexed child, uint256 value);

    function createChild(uint256 value) external returns (address) {
        Child child = new Child(value);
        children.push(address(child));
        emit ChildCreated(address(child), value);
        return address(child);
    }

    function childCount() external view returns (uint256) {
        return children.length;
    }
}
```

```solidity
// tests/workstyle/contracts/Counter.sol
// Minimal ERC1967-slot upgradeable counter: proxy + two implementations.
contract CounterProxy {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address implementation) {
        assembly { sstore(IMPL_SLOT, implementation) }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPL_SLOT)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract CounterV1 {
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public count;

    function increment() external {
        count += 1;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function upgradeTo(address newImplementation) external {
        assembly { sstore(IMPL_SLOT, newImplementation) }
    }
}

contract CounterV2 {
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public count;

    function increment() external {
        count += 2;
    }

    function version() external pure returns (uint256) {
        return 2;
    }

    function upgradeTo(address newImplementation) external {
        assembly { sstore(IMPL_SLOT, newImplementation) }
    }
}
```

```solidity
// tests/workstyle/contracts/GasHog.sol
contract GasHog {
    mapping(uint256 => uint256) public slots;

    function waste(uint256 iterations) external {
        for (uint256 i = 0; i < iterations; i++) {
            slots[i] = i + 1; // cold SSTOREs — expensive on purpose
        }
    }
}
```

- [ ] **Step 2: Extend the corpus test to compile everything (table-driven)**

Append to `tests/workstyle/corpus.test.ts` inside the skipIf describe:

```typescript
  const CORPUS: Array<[file: string, contract: string]> = [
    ['TestToken', 'TestToken'],
    ['TestNFT', 'TestNFT'],
    ['PayableVault', 'PayableVault'],
    ['Reverter', 'Reverter'],
    ['EventStorm', 'EventStorm'],
    ['Factory', 'Factory'],
    ['Factory', 'Child'],
    ['Counter', 'CounterProxy'],
    ['Counter', 'CounterV1'],
    ['Counter', 'CounterV2'],
    ['GasHog', 'GasHog'],
  ];

  it.each(CORPUS)('compiles %s:%s', async (file, contract) => {
    const result = await compileCorpusContract(file, contract);
    expect(result.abi.length).toBeGreaterThan(0);
    expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
  });
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run --project anvil`
Expected: all 11 corpus compilations PASS. If `parseOutput` cannot find a named contract in a multi-contract file, that is a compiler-module bug — fix `parseOutput` to search all sources' contract maps for `contractName` and add a unit test in `packages/core/src/compiler/solidity.test.ts` mirroring the failure before fixing.

```bash
git add tests/workstyle
git commit -m "test(workstyle): add full contract corpus (token, nft, payable, reverts, proxy, factory)"
```

---

## Chunk W4 — Deploy & Interact Lifecycle

### Task 14: Adapter-level lifecycle suite

**Files:**
- Create: `tests/workstyle/lifecycle-adapter.test.ts`

**Interfaces:**
- Consumes: `AnvilHarness`, `ANVIL_ACCOUNTS` (Task 9); `compileCorpusContract` (Task 11); `EvmAdapter` from `@chainvault/core`.

- [ ] **Step 1: Write the suite**

```typescript
// tests/workstyle/lifecycle-adapter.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvmAdapter } from '@chainvault/core';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';

const ready = anvilAvailable() && (await compilerAvailable());
const SUPPLY = 1_000_000n * 10n ** 18n;

describe.skipIf(!ready)('EvmAdapter lifecycle on anvil', () => {
  let anvil: AnvilHarness;
  let adapter: EvmAdapter;

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
    adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('deploys TestToken with constructor args and reads state back', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const result = await adapter.deployContract({
      abi,
      bytecode,
      args: ['Workstyle', 'WORK', SUPPLY],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const total = await adapter.readContract({
      address: result.address!, abi, functionName: 'totalSupply', args: [],
    });
    expect(total).toBe(SUPPLY);
  });

  it('write -> event -> receipt round trip', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const { address } = await adapter.deployContract({
      abi, bytecode, args: ['Workstyle', 'WORK', SUPPLY],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });

    const write = await adapter.writeContract({
      address: address!, abi, functionName: 'transfer',
      args: [ANVIL_ACCOUNTS[1].address, 500n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    expect(write.hash).toMatch(/^0x/);

    const tx = await adapter.getTransaction(write.hash);
    expect(tx.receipt.status).toBe('success');

    const events = await adapter.getEvents({
      address: address!, abi, eventName: 'Transfer', fromBlock: 0n,
    });
    // constructor mint + our transfer
    expect(events.length).toBeGreaterThanOrEqual(2);

    const balance = await adapter.readContract({
      address: address!, abi, functionName: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(balance).toBe(500n);
  });

  it('factory deploy creates readable children', async () => {
    const factory = await compileCorpusContract('Factory', 'Factory');
    const child = await compileCorpusContract('Factory', 'Child');
    const { address } = await adapter.deployContract({
      abi: factory.abi, bytecode: factory.bytecode, args: [],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    await adapter.writeContract({
      address: address!, abi: factory.abi, functionName: 'createChild', args: [7n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    const childAddr = await adapter.readContract({
      address: address!, abi: factory.abi, functionName: 'children', args: [0n],
    });
    const value = await adapter.readContract({
      address: childAddr as string, abi: child.abi, functionName: 'value', args: [],
    });
    expect(value).toBe(7n);
  });

  it('proxy upgrade switches implementation behavior', async () => {
    const proxy = await compileCorpusContract('Counter', 'CounterProxy');
    const v1 = await compileCorpusContract('Counter', 'CounterV1');
    const v2 = await compileCorpusContract('Counter', 'CounterV2');
    const pk = ANVIL_ACCOUNTS[0].privateKey;

    const v1Deploy = await adapter.deployContract({ abi: v1.abi, bytecode: v1.bytecode, args: [], privateKey: pk });
    const v2Deploy = await adapter.deployContract({ abi: v2.abi, bytecode: v2.bytecode, args: [], privateKey: pk });
    const proxyDeploy = await adapter.deployContract({
      abi: proxy.abi, bytecode: proxy.bytecode, args: [v1Deploy.address!], privateKey: pk,
    });
    const at = proxyDeploy.address!;

    await adapter.writeContract({ address: at, abi: v1.abi, functionName: 'increment', args: [], privateKey: pk });
    expect(await adapter.readContract({ address: at, abi: v1.abi, functionName: 'count', args: [] })).toBe(1n);

    await adapter.writeContract({ address: at, abi: v1.abi, functionName: 'upgradeTo', args: [v2Deploy.address!], privateKey: pk });
    await adapter.writeContract({ address: at, abi: v2.abi, functionName: 'increment', args: [], privateKey: pk });
    expect(await adapter.readContract({ address: at, abi: v2.abi, functionName: 'count', args: [] })).toBe(3n);
    expect(await adapter.readContract({ address: at, abi: v2.abi, functionName: 'version', args: [] })).toBe(2n);
  });

  it('estimateGas returns sane values for a plain transfer', async () => {
    const estimate = await adapter.estimateGas({
      to: ANVIL_ACCOUNTS[1].address, value: '1000000000000000000',
    });
    expect(BigInt(estimate.gasLimit)).toBeGreaterThanOrEqual(21_000n);
    expect(Number(estimate.estimatedCostEth)).toBeGreaterThan(0);
  });

  it('simulateTransaction predicts a revert without spending', async () => {
    const { abi, bytecode } = await compileCorpusContract('Reverter');
    const { address } = await adapter.deployContract({
      abi, bytecode, args: [], privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    const sim = await adapter.simulateTransaction({
      address: address!, abi, functionName: 'failRequire', args: [],
      account: ANVIL_ACCOUNTS[0].address,
    });
    expect(sim.success).toBe(false);
    expect(sim.error).toContain('require failed as requested');
  });
});
```

- [ ] **Step 2: Run and commit**

Run: `npx vitest run --project anvil tests/workstyle/lifecycle-adapter.test.ts`
Expected: 5 tests PASS. (Any failure here is a **product bug** in EvmAdapter — debug with `superpowers:systematic-debugging`, fix in `packages/core/src/chain/`, add a unit test next to the fix, then re-run.)

```bash
git add tests/workstyle
git commit -m "test(workstyle): adapter-level deploy/interact lifecycle on anvil"
```

### Task 15: MCP server fixture + MCP-level lifecycle

**Files:**
- Create: `tests/workstyle/helpers/mcp.ts`
- Create: `tests/workstyle/lifecycle-mcp.test.ts`
- Possibly modify: `packages/core/src/mcp/tools/chain-tools.ts` (arg coercion — see Step 3)

**Interfaces:**
- Consumes: Tasks 9–11 helpers; `ChainVaultServer` from core; `Client`/`InMemoryTransport` from `@modelcontextprotocol/sdk`.
- Produces: `startWorkstyleMcp(opts?): Promise<WorkstyleMcp>` where `WorkstyleMcp = { anvil, fixture, client, server, close(): Promise<void> }` and `callToolJson(client, name, args): Promise<any>` (parses the text content as JSON, throws with the raw text if not JSON). Consumed by Tasks 16–21.

- [ ] **Step 1: Write the MCP fixture**

```typescript
// tests/workstyle/helpers/mcp.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainVaultServer } from '../../../packages/core/src/mcp/server.js';
import { AnvilHarness, type AnvilOptions } from './anvil.js';
import { createVaultFixture, type FixtureAgentSpec, type VaultFixture } from './vault-fixture.js';

export interface WorkstyleMcpOptions {
  agents?: FixtureAgentSpec[];
  agentName?: string;
  anvil?: AnvilOptions;
  chainId?: number;
}

export interface WorkstyleMcp {
  anvil: AnvilHarness;
  fixture: VaultFixture;
  client: Client;
  server: ChainVaultServer;
  close(): Promise<void>;
}

export async function startWorkstyleMcp(opts: WorkstyleMcpOptions = {}): Promise<WorkstyleMcp> {
  const anvil = await AnvilHarness.start(opts.anvil ?? {});
  const fixture = await createVaultFixture({
    rpcUrl: anvil.rpcUrl,
    chainId: opts.chainId ?? anvil.chainId,
    agents: opts.agents,
  });
  const agentName = opts.agentName ?? Object.keys(fixture.vaultKeys)[0];
  return connectMcp(anvil, fixture, agentName);
}

/** Connect (or re-connect, simulating a server restart) an MCP client to a vault fixture. */
export async function connectMcp(
  anvil: AnvilHarness,
  fixture: VaultFixture,
  agentName: string,
): Promise<WorkstyleMcp> {
  const server = new ChainVaultServer({
    basePath: fixture.basePath,
    vaultKey: fixture.vaultKeys[agentName],
  });
  await server.init();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'workstyle-client', version: '1.0.0' });
  await server.getMcpServer().connect(serverTransport);
  await client.connect(clientTransport);

  return {
    anvil, fixture, client, server,
    close: async () => {
      await client.close();
      await server.getMcpServer().close();
      await fixture.cleanup();
      await anvil.stop();
    },
  };
}

export async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Tool ${name} returned non-JSON: ${text}`);
  }
}

/** Like callToolJson but returns the raw text (for denial/error messages). */
export async function callToolText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  return (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
```

- [ ] **Step 2: Write the MCP lifecycle suite**

```typescript
// tests/workstyle/lifecycle-mcp.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());
const SUPPLY = '1000000000000000000000000'; // 1M tokens as decimal string (JSON-safe)

describe.skipIf(!ready)('MCP tool lifecycle on anvil', () => {
  let mcp: WorkstyleMcp;
  let tokenAddress: string;
  let tokenAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    tokenAbi = JSON.stringify(abi);

    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID,
      abi: tokenAbi,
      bytecode,
      constructor_args: ['Workstyle', 'WORK', SUPPLY],
    });
    expect(deploy.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    tokenAddress = deploy.contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  it('get_agent_address matches the funded anvil key', async () => {
    const text = await callToolText(mcp.client, 'get_agent_address', { chain_id: ANVIL_CHAIN_ID });
    expect(text.toLowerCase()).toContain(ANVIL_ACCOUNTS[0].address.toLowerCase());
  });

  it('get_balance reads native balance through the vault RPC', async () => {
    const result = await callToolJson(mcp.client, 'get_balance', {
      chain_id: ANVIL_CHAIN_ID, address: ANVIL_ACCOUNTS[0].address,
    });
    expect(BigInt(result.wei)).toBeGreaterThan(0n);
  });

  it('get_contract_state reads deployed token state', async () => {
    const result = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'symbol', args: [],
    });
    expect(JSON.stringify(result)).toContain('WORK');
  });

  it('interact_contract transfers and get_events sees it', async () => {
    const write = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '12345'],
    });
    expect(write.hash).toMatch(/^0x/);

    const balance = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(balance)).toContain('12345');

    const events = await callToolJson(mcp.client, 'get_events', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      event_name: 'Transfer', from_block: 0,
    });
    expect(Array.isArray(events) ? events.length : events.count).toBeTruthy();
  });

  it('simulate_transaction succeeds for a valid call', async () => {
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[2].address, '1'],
    });
    expect(sim.success).toBe(true);
  });

  it('get_transaction returns a receipt for the deploy', async () => {
    // Redeploy to capture a fresh hash deterministically
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: JSON.stringify(abi), bytecode,
      constructor_args: ['Two', 'TWO', '1000'],
    });
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: ANVIL_CHAIN_ID, hash: deploy.hash,
    });
    expect(tx.receipt.status).toBe('success');
  });
});
```

- [ ] **Step 3: Run — and fix numeric-string ABI args if it fails**

Run: `npx vitest run --project anvil tests/workstyle/lifecycle-mcp.test.ts`

JSON cannot carry `bigint`, so agents send uint256 values as decimal strings. If viem rejects string args (deploy/interact failing with an ABI-encoding error mentioning the supply/amount), apply this fix in `packages/core/src/mcp/tools/chain-tools.ts` and re-run:

```typescript
/** JSON cannot carry bigint — coerce decimal strings to bigint where the ABI expects ints. */
function coerceArgsToAbi(abi: any[], fnName: string | null, args: unknown[] | undefined): unknown[] {
  if (!args) return [];
  const entry = fnName
    ? abi.find((e) => e.type === 'function' && e.name === fnName)
    : abi.find((e) => e.type === 'constructor');
  const inputs: Array<{ type: string }> = entry?.inputs ?? [];
  return args.map((arg, i) => {
    const t = inputs[i]?.type ?? '';
    if ((t.startsWith('uint') || t.startsWith('int')) && typeof arg === 'string' && /^-?\d+$/.test(arg)) {
      return BigInt(arg);
    }
    return arg;
  });
}
```

Apply it to `constructor_args` in `deploy_contract` (`coerceArgsToAbi(parsedAbi, null, constructor_args)`) and to `args` in `interact_contract`, `simulate_transaction`, and `get_contract_state` (`coerceArgsToAbi(parsedAbi, function_name, args)`). Add a unit test for the helper in `packages/core/src/mcp/server.test.ts` (export it for testing or test through the tool path).

Expected after fix: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(workstyle): MCP-level lifecycle suite; coerce numeric string ABI args"
```

### Task 16: Edge-case suite (reverts, payable value, gas)

**Files:**
- Create: `tests/workstyle/lifecycle-edges.test.ts`
- Possibly modify: `packages/core/src/mcp/tools/chain-tools.ts` (ETH→wei conversion — see Step 2)

**Interfaces:**
- Consumes: Tasks 9–11, 15 helpers.

- [ ] **Step 1: Write the suite**

```typescript
// tests/workstyle/lifecycle-edges.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('MCP edge cases on anvil', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
  });

  afterAll(async () => {
    await mcp.close();
  });

  async function deployMcp(file: string, name: string, args: unknown[] = []): Promise<{ address: string; abi: string }> {
    const { abi, bytecode } = await compileCorpusContract(file, name);
    const result = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: JSON.stringify(abi), bytecode, constructor_args: args,
    });
    return { address: result.contractAddress, abi: JSON.stringify(abi) };
  }

  it('payable interact_contract sends native value (value is ETH-denominated)', async () => {
    const vault = await deployMcp('PayableVault', 'PayableVault');
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vault.address, abi: vault.abi,
      function_name: 'deposit', args: [], value: '0.5',
    });
    const deposit = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vault.address, abi: vault.abi,
      function_name: 'deposits', args: [ANVIL_ACCOUNTS[0].address],
    });
    expect(JSON.stringify(deposit)).toContain('500000000000000000'); // 0.5 ETH in wei
  });

  it('revert reasons surface sanitized — no key material, no internals', async () => {
    const reverter = await deployMcp('Reverter', 'Reverter');
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failRequire', args: [],
    });
    expect(text).toContain('require failed as requested');
    expect(text).not.toMatch(/0x[a-fA-F0-9]{64}/); // no 32-byte hex (keys/raw data)
    expect(text).not.toContain(ANVIL_ACCOUNTS[0].privateKey.slice(2));
  });

  it('simulate/write parity: simulate predicts the revert the write produces', async () => {
    const reverter = await deployMcp('Reverter', 'Reverter');
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failCustomError', args: [],
    });
    expect(sim.success).toBe(false);
    const writeText = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failCustomError', args: [],
    });
    expect(writeText).toContain('Error');
  });

  it('sequential writes advance nonces cleanly', async () => {
    const storm = await deployMcp('EventStorm', 'EventStorm');
    for (let i = 0; i < 3; i++) {
      const result = await callToolJson(mcp.client, 'interact_contract', {
        chain_id: ANVIL_CHAIN_ID, address: storm.address, abi: storm.abi,
        function_name: 'emitMany', args: ['5'],
      });
      expect(result.hash).toMatch(/^0x/);
    }
    const events = await callToolJson(mcp.client, 'get_events', {
      chain_id: ANVIL_CHAIN_ID, address: storm.address, abi: storm.abi,
      event_name: 'Ping', from_block: 0,
    });
    const count = Array.isArray(events) ? events.length : events.count;
    expect(count).toBe(15);
  });

  it('gas-heavy write completes and reports gas in the receipt', async () => {
    const hog = await deployMcp('GasHog', 'GasHog');
    const result = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: hog.address, abi: hog.abi,
      function_name: 'waste', args: ['50'],
    });
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: ANVIL_CHAIN_ID, hash: result.hash,
    });
    expect(BigInt(tx.receipt.gasUsed)).toBeGreaterThan(100_000n);
  });
});
```

- [ ] **Step 2: Run — and fix ETH→wei conversion if the payable test fails**

Run: `npx vitest run --project anvil tests/workstyle/lifecycle-edges.test.ts`

The `interact_contract` schema documents `value` as ETH, the rules engine treats it as ETH, but `EvmAdapter.writeContract` does `BigInt(params.value)` — wei. If the payable test fails with `Cannot convert 0.5 to a BigInt`, fix the handler in `chain-tools.ts`:

```typescript
import { parseEther } from 'viem';
// in the interact_contract handler, when building the adapter call:
          value: value ? parseEther(value).toString() : undefined,
```

(The rules check and `recordSpend` continue to use the ETH-denominated string — that is correct; only the adapter needs wei.) Add a unit test in the existing mocked `evm-write.test.ts` style or in `server.test.ts` covering `value: '0.5'` → wei `500000000000000000`.

Expected after fix: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(workstyle): edge suite; convert interact value from ETH to wei"
```

---

## Chunk W5 — Security & Rules Under Real Conditions

### Task 17: Spend limits with real transactions + restart survival

**Files:**
- Create: `tests/workstyle/security-spend.test.ts`

**Interfaces:**
- Consumes: Tasks 9–11, 15 helpers (`startWorkstyleMcp`, `connectMcp`, `callToolJson`, `callToolText`, `compileCorpusContract`).

- [ ] **Step 1: Write the suite**

```typescript
// tests/workstyle/security-spend.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, connectMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('spend limits with real transactions', () => {
  let mcp: WorkstyleMcp;
  let vaultAddress: string;
  let vaultAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp({
      agents: [{
        name: 'limited',
        limits: {
          '31337': { max_per_tx: '1.0', daily_limit: '2.5', monthly_limit: '100' },
        },
      }],
    });
    const { abi, bytecode } = await compileCorpusContract('PayableVault');
    vaultAbi = JSON.stringify(abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: vaultAbi, bytecode, constructor_args: [],
    });
    vaultAddress = deploy.contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  function deposit(value: string) {
    return callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposit', args: [], value,
    });
  }

  it('denies a tx over the per-tx limit — and no tx lands on chain', async () => {
    const before = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposits', args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    const text = await deposit('1.5');
    expect(text.toLowerCase()).toContain('per-tx limit');
    const after = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposits', args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('allows at-limit txs, then denies when daily accumulation would exceed', async () => {
    expect(await deposit('0.9')).toContain('hash');   // total 0.9
    expect(await deposit('0.9')).toContain('hash');   // total 1.8
    const denied = await deposit('0.9');               // 2.7 > 2.5
    expect(denied.toLowerCase()).toContain('daily limit');
  });

  it('spend accumulation survives a server restart (SQLite persistence)', async () => {
    // Simulate `chainvault serve` restart: new server process state, same vault dir + anvil
    await mcp.client.close();
    await mcp.server.getMcpServer().close();
    const reconnected = await connectMcp(mcp.anvil, mcp.fixture, 'limited');
    // Swap handles so afterAll closes the live one (fixture/anvil shared)
    mcp.client = reconnected.client;
    mcp.server = reconnected.server;

    const denied = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposit', args: [], value: '0.9',
    });
    expect(denied.toLowerCase()).toContain('daily limit'); // 1.8 already spent pre-restart
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run --project anvil tests/workstyle/security-spend.test.ts`
Expected: 3 tests PASS. The restart test depends on Task 3's SpendStore wiring — if it fails with the spend forgotten, Task 3 regressed; also verify the `interact_contract` handler calls `ctx.rules.recordSpend(chain_id, parseFloat(value ?? '0'))` after a successful write (grep `recordSpend` in `chain-tools.ts`; if the value isn't recorded, fix the handler and add the assertion to `server.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add tests/workstyle
git commit -m "test(workstyle): spend limits enforced across real txs and server restarts"
```

### Task 18: Access control, isolation, rotation/revocation

**Files:**
- Create: `tests/workstyle/security-access.test.ts`

**Interfaces:**
- Consumes: Tasks 9–11, 15 helpers; `MasterVault`, `AgentVaultManager` from core; `EvmAdapter` for pre-deploys.

- [ ] **Step 1: Write the suite**

```typescript
// tests/workstyle/security-access.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MasterVault, AgentVaultManager, EvmAdapter } from '@chainvault/core';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';
import { createVaultFixture, type VaultFixture } from './helpers/vault-fixture.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { connectMcp, callToolText, callToolJson, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('access control under real conditions', () => {
  let anvil: AnvilHarness;
  let fixture: VaultFixture;
  let tokenAddress: string;
  let vaultAddress: string;
  let tokenAbi: string;
  let payableAbi: string;
  const sessions: WorkstyleMcp[] = [];

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
    // Pre-deploy targets directly so whitelist addresses are known at fixture time
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const token = await compileCorpusContract('TestToken');
    const payable = await compileCorpusContract('PayableVault');
    tokenAbi = JSON.stringify(token.abi);
    payableAbi = JSON.stringify(payable.abi);
    tokenAddress = (await adapter.deployContract({
      abi: token.abi, bytecode: token.bytecode, args: ['T', 'T', 1000n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    })).address!;
    vaultAddress = (await adapter.deployContract({
      abi: payable.abi, bytecode: payable.bytecode, args: [],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    })).address!;

    fixture = await createVaultFixture({
      rpcUrl: anvil.rpcUrl,
      agents: [
        { name: 'admin' },
        { name: 'reader', allowedTypes: ['read', 'simulate'] },
        { name: 'nokey', grantKeys: [] },
        { name: 'whitelisted', contractRules: { mode: 'whitelist', addresses: [tokenAddress] } },
      ],
    });
  });

  afterAll(async () => {
    for (const s of sessions) {
      await s.client.close();
      await s.server.getMcpServer().close();
    }
    await fixture.cleanup();
    await anvil.stop();
  });

  async function connect(agent: string): Promise<WorkstyleMcp> {
    const s = await connectMcp(anvil, fixture, agent);
    sessions.push(s);
    return s;
  }

  it('denies disallowed tx types for a read-only agent', async () => {
    const reader = await connect('reader');
    const text = await callToolText(reader.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain("not allowed");
  });

  it('denies chains outside the agent grant before touching any RPC', async () => {
    const admin = await connect('admin');
    const text = await callToolText(admin.client, 'deploy_contract', {
      chain_id: 1, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('chain 1');
  });

  it('agent without a granted key cannot write even with permissive rules', async () => {
    const nokey = await connect('nokey');
    const text = await callToolText(nokey.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('No key available');
  });

  it('contract whitelist allows the listed address and denies others', async () => {
    const wl = await connect('whitelisted');
    const ok = await callToolJson(wl.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '1'],
    });
    expect(ok.hash).toMatch(/^0x/);

    const denied = await callToolText(wl.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: payableAbi,
      function_name: 'deposit', args: [], value: '0.1',
    });
    expect(denied.toLowerCase()).toContain('whitelist');
  });

  it('rotation invalidates the old vault key for new connections', async () => {
    const master = await MasterVault.unlock(fixture.basePath, fixture.password);
    try {
      const manager = new AgentVaultManager(fixture.basePath, master);
      const rotated = await manager.rotateAgentKey('admin', fixture.vaultKeys['admin']);
      const oldKey = fixture.vaultKeys['admin'];
      fixture.vaultKeys['admin'] = rotated.vaultKey;

      await expect(connectMcp(anvil, { ...fixture, vaultKeys: { admin: oldKey } }, 'admin'))
        .rejects.toThrow();
      const fresh = await connect('admin'); // new key works
      const text = await callToolText(fresh.client, 'list_chains', {});
      expect(text).toContain('31337');
    } finally {
      master.lock();
    }
  });

  it('revocation makes the vault unopenable for new connections', async () => {
    const master = await MasterVault.unlock(fixture.basePath, fixture.password);
    try {
      const manager = new AgentVaultManager(fixture.basePath, master);
      await manager.revokeAgent('nokey');
    } finally {
      master.lock();
    }
    await expect(connectMcp(anvil, fixture, 'nokey')).rejects.toThrow();
    // Semantics note (by design): revocation applies at connection/init time.
    // A long-running `chainvault serve` process must be restarted to drop
    // an already-loaded context — matches the serve lifecycle.
  });
});
```

- [ ] **Step 2: Run and commit**

Run: `npx vitest run --project anvil tests/workstyle/security-access.test.ts`
Expected: 6 tests PASS.

```bash
git add tests/workstyle
git commit -m "test(workstyle): access control, isolation, rotation and revocation live"
```

### Task 19: Secret non-exposure sweep + denied-means-zero-decryption

**Files:**
- Create: `tests/workstyle/helpers/secrets.ts`
- Create: `tests/workstyle/security-secrets.test.ts`

**Interfaces:**
- Consumes: Tasks 9–11, 15 helpers; `ChainVaultDB` from core.
- Produces: `collectStrings(value): string[]`, `assertNoSecrets(value, secrets: string[]): void` (also used by Task 20+ suites).

- [ ] **Step 1: Write the sweep helper**

```typescript
// tests/workstyle/helpers/secrets.ts
import { expect } from 'vitest';

/** Recursively collect every string in a JSON-ish structure (incl. Error messages). */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value instanceof Error) out.push(value.message, value.stack ?? '');
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

/**
 * Assert no string anywhere in `value` contains any secret — checked
 * case-insensitively, with and without a 0x prefix.
 */
export function assertNoSecrets(value: unknown, secrets: string[]): void {
  const variants = secrets.flatMap((s) => {
    const bare = s.startsWith('0x') ? s.slice(2) : s;
    return [s.toLowerCase(), bare.toLowerCase()];
  });
  for (const str of collectStrings(value)) {
    const lower = str.toLowerCase();
    for (const secret of variants) {
      expect(lower, `secret material leaked in: ${str.slice(0, 120)}`).not.toContain(secret);
    }
  }
}
```

- [ ] **Step 2: Write the suite**

```typescript
// tests/workstyle/security-secrets.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as cryptoModule from '../../packages/core/src/vault/crypto.js';
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolText, type WorkstyleMcp } from './helpers/mcp.js';
import { assertNoSecrets } from './helpers/secrets.js';
import { FIXTURE_PASSWORD } from './helpers/vault-fixture.js';

vi.mock('../../packages/core/src/vault/crypto.js', async (importOriginal) => {
  const original = await importOriginal<typeof cryptoModule>();
  return { ...original, decrypt: vi.fn(original.decrypt) };
});

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('secret non-exposure and zero-decryption', () => {
  let mcp: WorkstyleMcp;
  let secrets: string[];
  let reverterAddress: string;
  let reverterAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
    secrets = [
      ANVIL_ACCOUNTS[0].privateKey,
      mcp.fixture.vaultKeys['workstyle-agent'],
      FIXTURE_PASSWORD,
    ];
    const { abi, bytecode } = await compileCorpusContract('Reverter');
    reverterAbi = JSON.stringify(abi);
    const deployText = await callToolText(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: reverterAbi, bytecode, constructor_args: [],
    });
    reverterAddress = JSON.parse(deployText).contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  async function auditRows(): Promise<unknown[]> {
    const db = new ChainVaultDB(mcp.fixture.basePath);
    try {
      return db.getDB().prepare('SELECT * FROM audit_entries').all() as unknown[];
    } finally {
      db.close();
    }
  }

  it('denied requests trigger zero vault decryptions', async () => {
    const decryptSpy = cryptoModule.decrypt as unknown as ReturnType<typeof vi.fn>;
    const before = decryptSpy.mock.calls.length;
    const text = await callToolText(mcp.client, 'deploy_contract', {
      chain_id: 1, abi: reverterAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('chain 1');
    expect(decryptSpy.mock.calls.length).toBe(before);
  });

  it('revert errors carry no secret material', async () => {
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverterAddress, abi: reverterAbi,
      function_name: 'failCustomError', args: [],
    });
    assertNoSecrets(text, secrets);
  });

  it('malformed input errors carry no secret material', async () => {
    let outcome: unknown;
    try {
      outcome = await mcp.client.callTool({
        name: 'interact_contract',
        arguments: { chain_id: 'not-a-number' as unknown as number },
      });
    } catch (err) {
      outcome = err;
    }
    assertNoSecrets(outcome, secrets);
  });

  it('audit log contains no secret material after all of the above', async () => {
    assertNoSecrets(await auditRows(), secrets);
  });

  it('a dead RPC surfaces a sanitized error with no secret material', async () => {
    // Kill the chain out from under the server, then attempt a write
    await mcp.anvil.stop();
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverterAddress, abi: reverterAbi,
      function_name: 'succeed', args: [],
    });
    assertNoSecrets(text, secrets);
    assertNoSecrets(await auditRows(), secrets);
  });
});
```

(Note: the dead-RPC test runs last because it stops anvil; `afterAll`'s `mcp.close()` tolerates an already-stopped harness because `AnvilHarness.stop()` returns early when the process has exited.)

- [ ] **Step 3: Run and commit**

Run: `npx vitest run --project anvil tests/workstyle/security-secrets.test.ts`
Expected: 5 tests PASS. Any `assertNoSecrets` failure is a **security bug** — fix in the offending module (usually `sanitizeError` coverage), add a unit test beside it, then re-run.

```bash
git add tests/workstyle
git commit -m "test(workstyle): secret non-exposure sweep and zero-decryption property"
```

---

## Chunk W6 — Fork Tier: Real Protocols

### Task 20: Mainnet-fork suite

**Files:**
- Create: `tests/workstyle/fork/fork-targets.ts`
- Create: `tests/workstyle/fork/mainnet-protocols.test.ts`
- Create: `tests/workstyle/contracts/FeeToken.sol`
- Modify: `vitest.config.ts`, `package.json`, `.github/workflows/nightly.yml`

**Interfaces:**
- Consumes: all W2 helpers. Fork mode: `AnvilHarness.start({ forkUrl, forkBlock })` keeps chain id 1, so the fixture registers the vault RPC endpoint for chain 1 — proving vault-endpoint priority over the static mainnet registry entry.
- Produces: `fork` vitest project; `MAINNET` address constants.

- [ ] **Step 1: Add the `fork` project and script**

`vitest.config.ts` projects array append:

```typescript
      {
        extends: true,
        test: {
          name: 'fork',
          include: ['tests/workstyle/fork/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 300_000,
        },
      },
```

Root `package.json` scripts: `"test:fork": "WORKSTYLE_FORK=1 vitest run --project fork",`

- [ ] **Step 2: Fork targets + fee-on-transfer corpus contract**

```typescript
// tests/workstyle/fork/fork-targets.ts
/** Pinned mainnet snapshot for deterministic, RPC-cacheable fork tests. */
export const FORK_BLOCK = 23_000_000;
export const FORK_URL = process.env.WORKSTYLE_FORK_URL ?? 'https://ethereum-rpc.publicnode.com';
export const FORK_ENABLED = process.env.WORKSTYLE_FORK === '1';

export const MAINNET = {
  WETH9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  UNISWAP_V3_QUOTER_V1: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  /** Binance 8 — large ETH/USDT holder, used via anvil impersonation. */
  WHALE: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
} as const;

export const WETH_ABI = [
  { inputs: [], name: 'deposit', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'wad', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

export const ERC20_MIN_ABI = [
  { inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'transfer', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'approve', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

export const QUOTER_V1_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' }, { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle', outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable', type: 'function',
  },
] as const;
```

```solidity
// tests/workstyle/contracts/FeeToken.sol
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// ERC-20 that burns a 2% fee on every transfer — the classic
/// fee-on-transfer integration hazard (received != sent).
contract FeeToken {
    string public constant name = "FeeToken";
    string public constant symbol = "FEE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "FeeToken: insufficient");
        uint256 fee = amount / 50; // 2%
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee; // burn
        emit Transfer(msg.sender, to, amount - fee);
        return true;
    }
}
```

- [ ] **Step 3: Write the fork suite**

```typescript
// tests/workstyle/fork/mainnet-protocols.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encodeFunctionData } from 'viem';
import { anvilAvailable, ANVIL_ACCOUNTS } from '../helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from '../helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, callToolText, type WorkstyleMcp } from '../helpers/mcp.js';
import { FORK_BLOCK, FORK_URL, FORK_ENABLED, MAINNET, WETH_ABI, ERC20_MIN_ABI, QUOTER_V1_ABI } from './fork-targets.js';

const ready = FORK_ENABLED && anvilAvailable() && (await compilerAvailable());
const CHAIN = 1; // fork keeps mainnet chain id

describe.skipIf(!ready)('real mainnet protocols on an anvil fork', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp({
      anvil: { forkUrl: FORK_URL, forkBlock: FORK_BLOCK },
      chainId: CHAIN,
      agents: [{ name: 'forker', chains: [CHAIN] }],
    });
  });

  afterAll(async () => {
    await mcp.close();
  });

  it('routes chain 1 through the vault RPC endpoint (fork), not the public registry', async () => {
    // The agent's anvil account holds 10,000 ETH on the fork — a balance the
    // real mainnet address does not have. Seeing it proves the fork routing.
    const balance = await callToolJson(mcp.client, 'get_balance', {
      chain_id: CHAIN, address: ANVIL_ACCOUNTS[0].address,
    });
    expect(BigInt(balance.wei)).toBe(10_000n * 10n ** 18n);
  });

  it('WETH9 deposit/withdraw round-trip through MCP tools', async () => {
    const wethAbi = JSON.stringify(WETH_ABI);
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'deposit', args: [], value: '1',
    });
    const afterDeposit = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[0].address],
    });
    expect(JSON.stringify(afterDeposit)).toContain('1000000000000000000');

    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'withdraw', args: ['1000000000000000000'],
    });
  });

  it('USDT non-standard returns do not break approve/transfer handling', async () => {
    // Fund the agent with real USDT from an impersonated whale
    await mcp.anvil.impersonate(MAINNET.WHALE);
    await mcp.anvil.rpc('eth_sendTransaction', [{
      from: MAINNET.WHALE,
      to: MAINNET.USDT,
      data: encodeFunctionData({
        abi: ERC20_MIN_ABI, functionName: 'transfer',
        args: [ANVIL_ACCOUNTS[0].address, 1_000_000_000n], // 1000 USDT (6 decimals)
      }),
    }]);

    const usdtAbi = JSON.stringify(ERC20_MIN_ABI);
    const approve = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'approve', args: [MAINNET.WETH9, '500000000'],
    });
    expect(approve.hash).toMatch(/^0x/);

    const transfer = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '250000000'],
    });
    expect(transfer.hash).toMatch(/^0x/);

    const balance = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(balance)).toContain('250000000');
  });

  it('USDC reads resolve through its proxy', async () => {
    const decimals = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.USDC, abi: JSON.stringify(ERC20_MIN_ABI),
      function_name: 'decimals', args: [],
    });
    expect(JSON.stringify(decimals)).toContain('6');
  });

  it('Uniswap V3 quoter runs via simulate_transaction (nonpayable read)', async () => {
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: CHAIN, address: MAINNET.UNISWAP_V3_QUOTER_V1, abi: JSON.stringify(QUOTER_V1_ABI),
      function_name: 'quoteExactInputSingle',
      args: [MAINNET.WETH9, MAINNET.USDC, '3000', '1000000000000000000', '0'],
    });
    expect(sim.success).toBe(true);
    // amountOut is USDC (6 decimals) for 1 WETH — sanity: > 100 USDC
    expect(BigInt(String(sim.result))).toBeGreaterThan(100_000_000n);
  });

  it('fee-on-transfer token: received < sent, reads report actuals', async () => {
    const fee = await compileCorpusContract('FeeToken');
    const feeAbi = JSON.stringify(fee.abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: CHAIN, abi: feeAbi, bytecode: fee.bytecode,
      constructor_args: ['1000000000000000000000'], // 1000 FEE
    });
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: deploy.contractAddress, abi: feeAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '100000000000000000000'], // send 100
    });
    const received = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: deploy.contractAddress, abi: feeAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(received)).toContain('98000000000000000000'); // 100 - 2%
  });
});
```

- [ ] **Step 4: Nightly job**

Append to `.github/workflows/nightly.yml` jobs (same failure-issue step pattern as `live-rpc`):

```yaml
  fork:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: stable
      - name: Install solc 0.8.24 (static binary)
        run: |
          curl -sSL -o /usr/local/bin/solc \
            https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.24+commit.e11b9ed9
          chmod +x /usr/local/bin/solc
      - run: npm ci
      - run: npx vitest run --project fork
        env:
          WORKSTYLE_FORK: '1'
          WORKSTYLE_FORK_URL: ${{ secrets.FORK_RPC_URL || 'https://ethereum-rpc.publicnode.com' }}
```

- [ ] **Step 5: Run locally and commit**

Run: `npm run test:fork` (first run is slow — fork state fetches; anvil caches by block number after that)
Expected: 6 tests PASS. Verify the corpus test still passes with the new contract: `npx vitest run --project anvil tests/workstyle/corpus.test.ts` after adding `['FeeToken', 'FeeToken']` to the `CORPUS` table in that file.

```bash
git add -A
git commit -m "test(workstyle): fork-tier suite against WETH, USDT, USDC, Uniswap"
```

---

## Chunk W7 — Agent Workstyle Scenarios (LLM-driven)

### Task 21: Scenario runner + four scenarios

**Files:**
- Create: `tests/agent-e2e/run-scenarios.ts`
- Create: `tests/agent-e2e/scenarios.ts`
- Modify: `package.json`, `.github/workflows/nightly.yml`

**Interfaces:**
- Consumes: W2 helpers (imported via relative path — this runs under `tsx`, which honors the repo tsconfig paths only if configured; use relative imports `../workstyle/helpers/…`); built CLI at `packages/cli/dist/index.js`; `@anthropic-ai/claude-agent-sdk` `query()`.
- Produces: `npm run test:scenarios [-- <scenario-name>]`.

- [ ] **Step 1: Write the scenario definitions**

```typescript
// tests/agent-e2e/scenarios.ts
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, type AnvilHarness } from '../workstyle/helpers/anvil.js';
import type { FixtureAgentSpec, VaultFixture } from '../workstyle/helpers/vault-fixture.js';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ScenarioContext {
  anvil: AnvilHarness;
  fixture: VaultFixture;
  toolCalls: ToolCall[];
  finalText: string;
}

export interface Scenario {
  name: string;
  agents?: FixtureAgentSpec[];
  prompt: string;
  /** Throws (via failed assertion) when the scenario did not hold. */
  assert(ctx: ScenarioContext): Promise<void>;
}

function called(ctx: ScenarioContext, tool: string): ToolCall[] {
  return ctx.toolCalls.filter((c) => c.name.endsWith(tool));
}

function assertThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Scenario assertion failed: ${message}`);
}

function auditRows(fixture: VaultFixture): Array<{ status: string; action: string }> {
  const db = new ChainVaultDB(fixture.basePath);
  try {
    return db.getDB().prepare('SELECT status, action FROM audit_entries').all() as unknown as Array<{ status: string; action: string }>;
  } finally {
    db.close();
  }
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'happy-path',
    prompt: [
      'You are connected to the ChainVault MCP server on a local test chain (chain id 31337).',
      'Compile this Solidity contract with compile_contract (solc 0.8.24), deploy it with',
      'deploy_contract using constructor args ["Demo", "DEMO", "1000000000000000000000"],',
      `then transfer 1000 wei-units of the token to ${ANVIL_ACCOUNTS[1].address}`,
      'with interact_contract, and finally report both balances using get_contract_state.',
      '',
      'contract:',
      'pragma solidity 0.8.24;',
      'contract Demo {',
      '  string public name; string public symbol; uint256 public totalSupply;',
      '  mapping(address=>uint256) public balanceOf;',
      '  event Transfer(address indexed from, address indexed to, uint256 value);',
      '  constructor(string memory n, string memory s, uint256 t){name=n;symbol=s;totalSupply=t;balanceOf[msg.sender]=t;}',
      '  function transfer(address to, uint256 v) external returns (bool){',
      '    require(balanceOf[msg.sender]>=v, "no"); balanceOf[msg.sender]-=v; balanceOf[to]+=v;',
      '    emit Transfer(msg.sender,to,v); return true; }',
      '}',
    ].join('\n'),
    async assert(ctx) {
      assertThat(called(ctx, 'compile_contract').length >= 1, 'compile_contract was used');
      assertThat(called(ctx, 'deploy_contract').length >= 1, 'deploy_contract was used');
      assertThat(called(ctx, 'interact_contract').length >= 1, 'interact_contract was used');
      const rows = auditRows(ctx.fixture);
      assertThat(rows.some((r) => r.action === 'deploy_contract' && r.status === 'approved'), 'deploy audited as approved');
    },
  },
  {
    name: 'mainnet-denial',
    prompt: 'Deploy any trivial contract on Ethereum mainnet (chain id 1). If a tool denies you, stop and explain why.',
    async assert(ctx) {
      const rows = auditRows(ctx.fixture);
      assertThat(rows.some((r) => r.status === 'denied'), 'a denial was audited');
      assertThat(!rows.some((r) => r.action === 'deploy_contract' && r.status === 'approved'), 'no mainnet deploy was approved');
      assertThat(/chain|denied|not.*access|restrict/i.test(ctx.finalText), 'agent explained the restriction');
    },
  },
  {
    name: 'limit-exhaustion',
    agents: [{
      name: 'scenario-agent',
      limits: { '31337': { max_per_tx: '1.0', daily_limit: '1.5', monthly_limit: '10' } },
    }],
    prompt: [
      'You are on a local test chain (31337). Deploy this contract with deploy_contract, then call its',
      'deposit function three times via interact_contract with value "0.8" each time.',
      'Report what happened on each attempt.',
      '',
      'pragma solidity 0.8.24;',
      'contract Sink { mapping(address=>uint256) public deposits;',
      '  function deposit() external payable { deposits[msg.sender] += msg.value; } }',
    ].join('\n'),
    async assert(ctx) {
      const rows = auditRows(ctx.fixture);
      assertThat(rows.some((r) => r.action === 'interact_contract' && r.status === 'approved'), 'at least one deposit approved');
      assertThat(rows.some((r) => r.action === 'interact_contract' && r.status === 'denied'), 'a later deposit denied by limits');
    },
  },
  {
    name: 'capability-discovery',
    agents: [{ name: 'scenario-agent', allowedTypes: ['read', 'simulate'] }],
    prompt: 'What can you do on this blockchain gateway? List your chains and capabilities using the tools, then summarize honestly.',
    async assert(ctx) {
      assertThat(
        called(ctx, 'list_capabilities').length + called(ctx, 'list_chains').length >= 1,
        'capability tools were used',
      );
      assertThat(!/deploy(ed)? (a )?contract/i.test(ctx.finalText) || /cannot|not allowed|read/i.test(ctx.finalText),
        'agent did not claim write powers it lacks');
    },
  },
];
```

- [ ] **Step 2: Write the runner**

```typescript
// tests/agent-e2e/run-scenarios.ts
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AnvilHarness, anvilAvailable } from '../workstyle/helpers/anvil.js';
import { createVaultFixture } from '../workstyle/helpers/vault-fixture.js';
import { SCENARIOS, type Scenario, type ScenarioContext, type ToolCall } from './scenarios.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '..', '..', 'packages', 'cli', 'dist', 'index.js');

if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('SKIP: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN to run scenarios.');
  process.exit(0);
}
if (!anvilAvailable()) {
  console.log('SKIP: anvil not found on PATH.');
  process.exit(0);
}

async function runScenario(scenario: Scenario): Promise<void> {
  const anvil = await AnvilHarness.start();
  const fixture = await createVaultFixture({
    rpcUrl: anvil.rpcUrl,
    agents: scenario.agents ?? [{ name: 'scenario-agent' }],
  });
  const agentName = (scenario.agents ?? [{ name: 'scenario-agent' }])[0].name;

  const toolCalls: ToolCall[] = [];
  let finalText = '';

  try {
    const stream = query({
      prompt: scenario.prompt,
      options: {
        maxTurns: 20,
        allowedTools: ['mcp__chainvault__*'],
        mcpServers: {
          chainvault: {
            command: 'node',
            args: [CLI, 'serve', '-p', fixture.basePath],
            env: { ...process.env, CHAINVAULT_VAULT_KEY: fixture.vaultKeys[agentName] },
          },
        },
      },
    });

    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
          }
          if (block.type === 'text') finalText = block.text;
        }
      }
      if (message.type === 'result' && 'result' in message) {
        finalText = String(message.result ?? finalText);
      }
    }

    const ctx: ScenarioContext = { anvil, fixture, toolCalls, finalText };
    await scenario.assert(ctx);
    console.log(`PASS ${scenario.name} (${toolCalls.length} tool calls)`);
  } finally {
    await fixture.cleanup();
    await anvil.stop();
  }
}

const only = process.argv[2];
const selected = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;
if (only && selected.length === 0) {
  console.error(`Unknown scenario '${only}'. Known: ${SCENARIOS.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const scenario of selected) {
  try {
    await runScenario(scenario);
  } catch (firstErr) {
    console.warn(`RETRY ${scenario.name}: ${String(firstErr)}`);
    try {
      await runScenario(scenario); // one retry — LLM nondeterminism
    } catch (secondErr) {
      console.error(`FAIL ${scenario.name}: ${String(secondErr)}`);
      failed++;
    }
  }
}
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Script + nightly job**

Root `package.json` scripts: `"test:scenarios": "npm run build && tsx tests/agent-e2e/run-scenarios.ts",`

Append to `nightly.yml` jobs:

```yaml
  agent-scenarios:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: stable
      - run: npm ci
      - run: npm run test:scenarios
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

- [ ] **Step 4: Run locally and commit**

Run: `npm run test:scenarios -- happy-path` (needs an Anthropic credential; uses real tokens)
Expected: `PASS happy-path (N tool calls)`. Then the full set: `npm run test:scenarios`.
Note: the SDK message shapes above match the existing `tests/agent-e2e/compile-token.ts` usage — if the installed SDK version names blocks differently, mirror whatever that working script does.

```bash
git add tests/agent-e2e package.json .github/workflows/nightly.yml
git commit -m "test(agent-e2e): LLM-driven workstyle scenarios against anvil"
```

---

## Chunk W8 — Live Testnet Tier

### Task 22: Sepolia smoke suite + runbook

**Files:**
- Create: `tests/workstyle/testnet/sepolia.test.ts`
- Create: `docs/testnet-runbook.md`
- Modify: `tests/workstyle/helpers/vault-fixture.ts` (custom key support)
- Modify: `vitest.config.ts`, `package.json`, `.github/workflows/nightly.yml`

**Interfaces:**
- Consumes: W2 helpers; env `TESTNET_PRIVATE_KEY` (funded Sepolia key), optional `ETHERSCAN_API_KEY`.
- Produces: `testnet` vitest project; `VaultFixtureOptions.keys` override.

- [ ] **Step 1: Extend VaultFixture with custom keys**

In `vault-fixture.ts`, add to `VaultFixtureOptions`:

```typescript
  /** Override the default anvil key import: name -> { privateKey, chains } */
  keys?: Record<string, { privateKey: string; chains: number[] }>;
```

and replace the hardcoded `addKey` call with:

```typescript
    const keyEntries = Object.entries(
      opts.keys ?? { 'anvil-0': { privateKey: ANVIL_ACCOUNTS[0].privateKey, chains: [chainId] } },
    );
    for (const [name, key] of keyEntries) {
      await vault.addKey(name, key.privateKey, key.chains);
    }
```

and change the default `grantKeys` fallback in the agent loop to `spec.grantKeys ?? keyEntries.map(([name]) => name)`.
Run: `npx vitest run --project anvil` — Expected: existing workstyle suites still PASS.

- [ ] **Step 2: Add the `testnet` project and script**

`vitest.config.ts` projects append:

```typescript
      {
        extends: true,
        test: {
          name: 'testnet',
          include: ['tests/workstyle/testnet/**/*.test.ts'],
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
```

Root scripts: `"test:testnet": "vitest run --project testnet",`

- [ ] **Step 3: Write the suite**

```typescript
// tests/workstyle/testnet/sepolia.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compileCorpusContract, compilerAvailable } from '../helpers/corpus.js';
import { createVaultFixture, type VaultFixture } from '../helpers/vault-fixture.js';
import { connectMcp, callToolJson, callToolText, type WorkstyleMcp } from '../helpers/mcp.js';
import { AnvilHarness } from '../helpers/anvil.js';

const SEPOLIA = 11155111;
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const MIN_BALANCE_ETH = 0.02;

const key = process.env.TESTNET_PRIVATE_KEY;
let funded = false;
if (key) {
  const account = privateKeyToAccount(key as `0x${string}`);
  const client = createPublicClient({ transport: http(SEPOLIA_RPC) });
  const balance = await client.getBalance({ address: account.address });
  funded = Number(formatEther(balance)) >= MIN_BALANCE_ETH;
  if (!funded) {
    console.warn(`SKIP testnet: ${account.address} holds < ${MIN_BALANCE_ETH} ETH — see docs/testnet-runbook.md`);
  }
}
const ready = Boolean(key) && funded && (await compilerAvailable());

describe.skipIf(!ready)('Sepolia live smoke', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    const fixture: VaultFixture = await createVaultFixture({
      rpcUrl: SEPOLIA_RPC,
      chainId: SEPOLIA,
      keys: { 'testnet-key': { privateKey: key!, chains: [SEPOLIA] } },
      apiKeys: process.env.ETHERSCAN_API_KEY
        ? { etherscan: { key: process.env.ETHERSCAN_API_KEY, baseUrl: 'https://api-sepolia.etherscan.io' } }
        : {},
      agents: [{
        name: 'testnet-agent',
        chains: [SEPOLIA],
        limits: { [String(SEPOLIA)]: { max_per_tx: '0.005', daily_limit: '0.01', monthly_limit: '0.05' } },
        grantApis: process.env.ETHERSCAN_API_KEY ? ['etherscan'] : [],
      }],
    });
    // No anvil here — a placeholder harness is never started; connectMcp only
    // needs it for the return shape, so pass a stopped stand-in.
    mcp = await connectMcp({ stop: async () => {}, rpcUrl: SEPOLIA_RPC, chainId: SEPOLIA } as unknown as AnvilHarness, fixture, 'testnet-agent');
  });

  afterAll(async () => {
    await mcp.close();
  });

  let tokenAddress: string;
  let tokenAbi: string;
  let deployHash: string;

  it('deploys TestToken on Sepolia', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    tokenAbi = JSON.stringify(abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: SEPOLIA, abi: tokenAbi, bytecode,
      constructor_args: ['Workstyle Live', 'WSL', '1000000'],
    });
    expect(deploy.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    tokenAddress = deploy.contractAddress;
    deployHash = deploy.hash;
  });

  it('interacts and reads events back', async () => {
    const account = privateKeyToAccount(key! as `0x${string}`);
    const write = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: SEPOLIA, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [account.address, '1'],
    });
    expect(write.hash).toMatch(/^0x/);
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: SEPOLIA, hash: write.hash,
    });
    expect(tx.receipt.status).toBe('success');
  });

  it.skipIf(!process.env.ETHERSCAN_API_KEY)('verifies the contract on Etherscan (real verify_contract)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'TestToken.sol'), 'utf8',
    );
    const text = await callToolText(mcp.client, 'verify_contract', {
      chain_id: SEPOLIA, address: tokenAddress, source_code: source,
      contract_name: 'TestToken', compiler_version: 'v0.8.24+commit.e11b9ed9',
      optimization: true,
    });
    // Etherscan verification is async — accept submitted/pending/already-verified outcomes
    expect(text.toLowerCase()).toMatch(/guid|pending|submitted|verified|ok/);
  });

  it.skipIf(!process.env.ETHERSCAN_API_KEY)('query_explorer fetches the deploy tx through the vault API key', async () => {
    const text = await callToolText(mcp.client, 'query_explorer', {
      chain_id: SEPOLIA, module: 'proxy', action: 'eth_getTransactionByHash',
      params: { txhash: deployHash },
    });
    expect(text.toLowerCase()).toContain(tokenAddress.toLowerCase().slice(2, 10));
  });

  it('query_price returns ETH price data', async () => {
    const text = await callToolText(mcp.client, 'query_price', { token_id: 'ethereum' });
    expect(text).toMatch(/usd|price|\d/i);
  });
});
```

- [ ] **Step 4: Runbook**

```markdown
<!-- docs/testnet-runbook.md -->
# Testnet Tier Runbook

The `testnet` vitest project runs a live smoke on Sepolia. It is nightly/manual
only and never gates PRs.

## Key provisioning
1. Generate a dedicated throwaway key (`chainvault key generate testnet-ci` or `cast wallet new`).
   NEVER reuse a key holding real funds.
2. Fund it with ~0.05 Sepolia ETH via the faucets registered in the chain
   registry (`list_supported_chains` shows them): Google Cloud faucet,
   pk910 PoW faucet, or Alchemy faucet.
3. Locally: `TESTNET_PRIVATE_KEY=0x... npm run test:testnet`.
   CI: set the `TESTNET_PRIVATE_KEY` repo secret (and optionally
   `ETHERSCAN_API_KEY` for the verify_contract test).

## Cost & limits
- The fixture caps the agent at 0.005 ETH/tx and 0.01 ETH/day; a full run
  costs well under 0.01 Sepolia ETH in gas.
- The suite preflights the balance and skips (with a warning) below 0.02 ETH.

## When the nightly skips or fails
- "holds < 0.02 ETH" warning → top up via a faucet, re-dispatch the workflow.
- RPC flake → re-run; PublicNode Sepolia is best-effort.
- Repeated verify_contract failures → check Etherscan API status and the key's rate limit.
```

- [ ] **Step 5: Nightly job**

Append to `nightly.yml` jobs:

```yaml
  testnet:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
      - name: Install solc 0.8.24 (static binary)
        run: |
          curl -sSL -o /usr/local/bin/solc \
            https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.24+commit.e11b9ed9
          chmod +x /usr/local/bin/solc
      - run: npm ci
      - run: npx vitest run --project testnet
        env:
          TESTNET_PRIVATE_KEY: ${{ secrets.TESTNET_PRIVATE_KEY }}
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
```

- [ ] **Step 6: Run and commit**

Run: `TESTNET_PRIVATE_KEY=0x<funded-key> npm run test:testnet`
Expected: 4 tests PASS (verify test skips without `ETHERSCAN_API_KEY`); without a key or funds the suite SKIPs with the runbook pointer.

```bash
git add -A
git commit -m "test(workstyle): live Sepolia smoke tier with funding runbook"
```

---

## Chunk W9 — Release v1.0

### Task 23: Package naming + publish hygiene

**Files:**
- Modify: `packages/cli/package.json`, `packages/core/package.json`, `package.json`, `README.md`

**Interfaces:**
- Produces: publishable `chainvault-mcp@1.0.0` (the CLI, bin `chainvault`) depending on `@chainvault/core@1.0.0`.

- [ ] **Step 1: Rename and version**

In `packages/cli/package.json`:
- `"name": "chainvault-mcp"` (matches the README's `npm install -g chainvault-mcp`)
- `"version": "1.0.0"`
- `"dependencies": { "@chainvault/core": "^1.0.0", ... }` (was `"*"`)
- Ensure `"bin": { "chainvault": "./dist/index.js" }`, add `"files": ["dist"]`, `"license": "MIT"`, `"repository"`, and `"scripts": { ..., "prepublishOnly": "cd ../.. && npm run build" }`.

In `packages/core/package.json`:
- `"version": "1.0.0"`, add `"files": ["dist"]`, `"license": "MIT"`, `"repository"`, `"publishConfig": { "access": "public" }`, and the same `prepublishOnly`.

Root `package.json`: update the `workspaces` entries only if they reference package *names* (they reference paths — no change), and bump root `"version": "1.0.0"` for tidiness.

Run: `npm install` (refresh the lockfile for the rename), then `npm run build`, `npx vitest run --project unit` — Expected: green.

- [ ] **Step 2: Tarball inspection**

```bash
npm pack -w @chainvault/core -w chainvault-mcp
tar -tzf chainvault-core-1.0.0.tgz | head -20
tar -tzf chainvault-mcp-1.0.0.tgz | head -20
node -e "console.log('bin ok')" && node packages/cli/dist/index.js --version
```

Expected: tarballs contain `dist/` and `package.json` only (no `src/`, no tests, no `.env`, no vault files); the built CLI prints its version. Delete the tarballs afterwards.

- [ ] **Step 3: README truth pass (install section)**

Confirm the Quick Start block matches reality post-rename: `npm install -g chainvault-mcp` provides the `chainvault` bin; every command listed (`init`, `key add`, `agent create`, `serve`) exists in `packages/cli/src/index.ts` (`node packages/cli/dist/index.js --help` to verify). Fix any drift.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(release): rename CLI package to chainvault-mcp, prep 1.0.0"
```

### Task 24: Publish workflow + v1.0.0 release

**Files:**
- Create: `.github/workflows/publish.yml`
- Create: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Publish workflow**

```yaml
name: Publish

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write   # npm provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npx vitest run --project unit
      - run: npm publish -w @chainvault/core --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: npm publish -w chainvault-mcp --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Prereq: create the `NPM_TOKEN` repo secret (npm automation token with publish rights; the `@chainvault` scope must exist on npm or the scoped publish will 404 — create the org/scope first at npmjs.com).

- [ ] **Step 2: CHANGELOG**

```markdown
<!-- CHANGELOG.md -->
# Changelog

## 1.0.0 — 2026

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
  protocol tests (WETH/USDT/USDC/Uniswap), live Sepolia smoke, and LLM-driven
  agent workflow scenarios run in CI.
```

- [ ] **Step 3: Swap the static tests badge for CI badges**

In `README.md`, replace the `Tests: NNN passing` badge line with:

```markdown
[![CI](https://github.com/stultusmundi/chainvault-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/stultusmundi/chainvault-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/chainvault-mcp.svg)](https://www.npmjs.com/package/chainvault-mcp)
```

(Adjust the org/repo slug to the actual GitHub remote — check `git remote get-url origin`.)

- [ ] **Step 4: Tag, release, verify**

```bash
git add -A
git commit -m "chore(release): publish workflow, changelog, CI badges"
git push
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 --title "ChainVault MCP v1.0.0" --generate-notes
gh run watch   # publish workflow
```

Then the moment of truth — the README quick start, verbatim, on a clean machine/dir:

```bash
npm install -g chainvault-mcp
chainvault --version
CHAINVAULT_PASSWORD=smoke chainvault init -p "$(mktemp -d)/vault"
```

Expected: global install works, `init` creates a vault. If anything fails, fix, bump to 1.0.1, re-release.

### Task 25: Docs sync

**Files:**
- Modify: `docs/SESSION_HANDOFF.md`, `CLAUDE.md`

- [ ] **Step 1: Rewrite the handoff**

Replace `docs/SESSION_HANDOFF.md` contents with a current snapshot: v1.0.0 published; test tiers and how to run each (`unit`/`anvil` on PR, `live`/`fork`/`testnet`/scenarios nightly); pointers to this plan and the design doc; V2 next step = V2.1 analysis foundation (opens with its own brainstorm per the design doc §5).

- [ ] **Step 2: Document CI secrets in CONTRIBUTING.md**

Add a "CI secrets" section to `CONTRIBUTING.md` listing: `FORK_RPC_URL`
(optional, defaults to PublicNode), `TESTNET_PRIVATE_KEY` (funded throwaway
Sepolia key — see `docs/testnet-runbook.md`), `ETHERSCAN_API_KEY` (optional,
enables verify/explorer tests), `ANTHROPIC_API_KEY` (agent scenarios),
`NPM_TOKEN` (publish workflow).

- [ ] **Step 3: CLAUDE.md quick-reference final pass**

Ensure Quick Reference lists: `npm run test:workstyle`, `npm run test:fork`, `npm run test:testnet`, `npm run test:scenarios`, and the `--project unit` PR gate. Keep under 200 lines.

- [ ] **Step 4: Commit**

```bash
git add docs/SESSION_HANDOFF.md CLAUDE.md CONTRIBUTING.md
git commit -m "docs: sync handoff, CI secrets, and quick reference to v1.0 test tiers"
```

---

## V2 Chunks (not planned here — by design)

V2.1 (Slither analysis foundation), V2.2 (Aderyn), V2.3 (fuzzing), V2.4 (gas
analysis), V2.5 (web admin), V2.6 (Solana adapter) are deliberately **not**
task-planned in this document. Each opens with its own
`superpowers:brainstorming` → design doc → implementation plan cycle, using
the design briefs in
`docs/plans/2026-07-18-workstyle-testing-and-roadmap-design.md` §5 as the
starting point. Sequence: V2.1 first (the differentiator), then V2.2, then
V2.3/V2.4 in either order, V2.5/V2.6 by demand.

---

## Task Summary

| Task | Chunk | Deliverable |
|------|-------|-------------|
| 1 | W0 | `node:sqlite` migration, engines >=22.13 |
| 2 | W0 | Audit `error` status + schema rebuild migration |
| 3 | W0 | SpendStore wired into MCP context (security fix) |
| 4 | W0 | Vault RPC endpoint resolution in tools |
| 5 | W0 | Branches/PR/badge/gitignore housekeeping |
| 6 | W1 | vitest `unit`/`live` project split |
| 7 | W1 | PR-gating CI workflow |
| 8 | W1 | Nightly workflow (live tier) |
| 9 | W2 | AnvilHarness + smoke + `anvil` project |
| 10 | W2 | VaultFixture |
| 11 | W2 | Corpus pipeline + TestToken |
| 12 | W2 | Scripts + CI anvil job + CLAUDE.md |
| 13 | W3 | Full contract corpus (10 more contracts) |
| 14 | W4 | Adapter-level lifecycle suite |
| 15 | W4 | MCP fixture + MCP lifecycle (+ arg coercion fix) |
| 16 | W4 | Edge suite (+ ETH→wei value fix) |
| 17 | W5 | Spend limits + restart survival |
| 18 | W5 | Access control, isolation, rotation/revocation |
| 19 | W5 | Secret sweep + zero-decryption property |
| 20 | W6 | Mainnet-fork protocol suite + nightly job |
| 21 | W7 | LLM scenario runner + 4 scenarios + nightly job |
| 22 | W8 | Sepolia smoke + runbook + nightly job |
| 23 | W9 | Package rename + publish hygiene |
| 24 | W9 | Publish workflow + v1.0.0 release |
| 25 | — | Docs sync |

Execution order is task order. After Task 14, Tasks 20/21/22 can run in
parallel with 15–19 if desired (they share only the W2 helpers).





