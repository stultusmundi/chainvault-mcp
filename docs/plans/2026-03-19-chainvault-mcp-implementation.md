# ChainVault MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a secure MCP server that acts as a gateway between AI agents and EVM blockchains, with vault-based key management and rule-enforced access control.

**Architecture:** Modular monolith TypeScript monorepo with two packages (`@chainvault/core` and `@chainvault/cli`). Core contains vault, rules, chain, proxy, and MCP modules. CLI provides TUI and direct commands.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/server`, `viem`, `zod/v4`, `ink` (React CLI), `vitest` for testing, npm workspaces.

**Design Doc:** `docs/plans/2026-03-19-chainvault-mcp-design.md`

---

## Development Process Rules

These rules apply to EVERY task in this plan. Read before starting any work.

### Commit Discipline

- **Concise commit messages.** One line, imperative mood, under 72 characters. No fluff.
  - Good: `feat(vault): add AES-256-GCM encryption module`
  - Bad: `Added the encryption module with various functions for encrypting and decrypting data using AES-256-GCM algorithm`
- **One concern per commit.** Don't mix feature code with docs or config changes.
- **Co-author line** on every commit: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

### Before Starting Any Task

1. **Read `CLAUDE.md`** at the repo root and any relevant subdirectory `CLAUDE.md` files. Follow all instructions found there.
2. **Check `git log --oneline -10`** to understand recent changes and ensure you're not duplicating work.
3. **Check `git status`** to ensure a clean working tree before starting.

### After Completing Each Task

1. **Run the full test suite** (`npx vitest run`) — not just the task's tests.
2. **Run `npx tsc --noEmit`** to verify no type errors were introduced.
3. **Update CLAUDE.md files** if the task introduced new conventions, commands, or architectural decisions that future development sessions need to know.
4. **Update README.md** if the task added user-facing functionality.
5. **Review your diff** (`git diff --staged`) before committing. Remove debug code, console.logs, and commented-out code.

### CLAUDE.md File Standards (Anthropic Guidelines)

All CLAUDE.md files in this project MUST follow these rules:

- **Under 200 lines** per file. Shorter is better. Every line must earn its place.
- **Concrete and verifiable** instructions, not vague guidance. "Run `npx vitest run` before committing" not "test your changes".
- **No obvious/self-evident instructions.** Don't tell Claude to "write clean code" or follow standard TypeScript conventions.
- **No sensitive data.** No API keys, passwords, or connection strings.
- **No codebase descriptions.** Claude can read the code. Only include what it can't infer.
- **Use markdown headers and bullets** for scannable structure.
- **Use `IMPORTANT` or `YOU MUST`** sparingly for critical rules.
- **Nested CLAUDE.md files** for subdirectories when that directory has specific conventions (e.g., `packages/core/CLAUDE.md` for core-specific rules, `packages/cli/CLAUDE.md` for CLI-specific rules).
- **Path-scoped rules** in `.claude/rules/` for cross-cutting concerns that apply to specific file patterns.
- **Import syntax** (`@path/to/file`) to reference docs without duplicating content.
- **Prune regularly.** If removing a line wouldn't cause Claude to make mistakes, remove it.

### CLAUDE.md Hierarchy for This Project

```
chainvault-mcp/
  CLAUDE.md                      # Root: project overview, build/test/lint commands, monorepo conventions
  packages/
    core/
      CLAUDE.md                  # Core: vault encryption patterns, security invariants, module boundaries
    cli/
      CLAUDE.md                  # CLI: Ink/React patterns, commander conventions, TUI structure
  .claude/
    rules/
      security.md                # Path-scoped: security rules for vault/** and chain/** files
      testing.md                 # Path-scoped: TDD rules for all test files
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`

**Step 1: Create root `package.json` with npm workspaces**

```json
{
  "name": "chainvault-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "Secure MCP server gateway between AI agents and blockchains",
  "workspaces": [
    "packages/core",
    "packages/cli"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/cli" }
  ]
}
```

**Step 3: Create `packages/core/package.json`**

```json
{
  "name": "@chainvault/core",
  "version": "0.1.0",
  "description": "ChainVault MCP core server and modules",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.12.0",
    "viem": "^2.30.0",
    "zod": "^3.25.0"
  }
}
```

**Step 4: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create `packages/core/src/index.ts`**

```typescript
export const VERSION = '0.1.0';
```

**Step 6: Create `packages/cli/package.json`**

```json
{
  "name": "@chainvault/cli",
  "version": "0.1.0",
  "description": "ChainVault MCP CLI and TUI",
  "type": "module",
  "bin": {
    "chainvault": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@chainvault/core": "*",
    "ink": "^5.2.0",
    "react": "^18.3.0",
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0"
  }
}
```

**Step 7: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" }
  ]
}
```

**Step 8: Create `packages/cli/src/index.ts`**

```typescript
#!/usr/bin/env node
console.log('ChainVault MCP v0.1.0');
```

**Step 9: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});
```

**Step 10: Create `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
.env
coverage/
```

**Step 11: Create `.npmrc`**

```
engine-strict=true
```

**Step 12: Install dependencies**

Run: `npm install`
Expected: Clean install with no errors.

**Step 13: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 14: Verify test runner**

Run: `npx vitest run`
Expected: "No test files found" (no tests yet, but runner works).

**Step 15: Commit**

```bash
git add .
git commit -m "chore: scaffold monorepo with core and cli packages"
```

---

## Task 1B: CLAUDE.md Files & Project Rules

**Files:**
- Create: `CLAUDE.md` (root)
- Create: `packages/core/CLAUDE.md`
- Create: `packages/cli/CLAUDE.md`
- Create: `.claude/rules/security.md`
- Create: `.claude/rules/testing.md`

This task sets up the CLAUDE.md hierarchy so every subsequent task benefits from project context. These files are living documents — update them as the project evolves.

**Step 1: Create root `CLAUDE.md`**

```markdown
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
```

**Step 2: Create `packages/core/CLAUDE.md`**

```markdown
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
```

**Step 3: Create `packages/cli/CLAUDE.md`**

```markdown
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
```

**Step 4: Create `.claude/rules/security.md`**

```markdown
---
paths:
  - "packages/core/src/vault/**"
  - "packages/core/src/chain/**"
  - "packages/core/src/mcp/**"
---

# Security Rules

YOU MUST follow these rules when modifying vault, chain, or MCP code:

- Never log, return, or include private keys or API keys in any output
- Wipe secrets from memory after use (set to null, fill buffers with zeros)
- Validate all inputs with Zod before processing
- Use `createCipheriv`/`createDecipheriv` with explicit auth tag length — never shortcut
- All chain write operations must pass through the rules engine first
- Never expose vault internals (encryption keys, salt, raw vault data) through MCP tools
```

**Step 5: Create `.claude/rules/testing.md`**

```markdown
---
paths:
  - "**/*.test.ts"
---

# Testing Rules

- Follow TDD: write failing test → verify failure → implement → verify pass
- Run the specific test file first, then full suite before committing
- Use `describe`/`it` blocks with descriptive names that read as specifications
- Create temp directories for any file-based tests, clean up in `afterEach`
- Mock external services (RPCs, APIs) — tests must work offline
- Test both success and failure paths (especially for security-related code)
- Never skip or `.todo` tests — if it's worth writing, it's worth finishing
```

**Step 6: Verify CLAUDE.md files are under 200 lines each**

Run: `wc -l CLAUDE.md packages/core/CLAUDE.md packages/cli/CLAUDE.md .claude/rules/security.md .claude/rules/testing.md`
Expected: All files under 200 lines.

**Step 7: Commit**

```bash
git add CLAUDE.md packages/core/CLAUDE.md packages/cli/CLAUDE.md .claude/rules/security.md .claude/rules/testing.md
git commit -m "docs: add CLAUDE.md hierarchy and path-scoped rules"
```

---

## Task 2: Encryption Module

**Files:**
- Create: `packages/core/src/vault/crypto.ts`
- Create: `packages/core/src/vault/crypto.test.ts`

This module wraps Node.js `crypto` for AES-256-GCM encryption/decryption and HKDF key derivation. It is the foundation for all vault operations.

**Step 1: Write failing tests for encryption module**

```typescript
// packages/core/src/vault/crypto.test.ts
import { describe, it, expect } from 'vitest';
import {
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  generateRandomKey,
  generateVaultKeyString,
} from './crypto.js';

describe('deriveKeyFromPassword', () => {
  it('derives a 256-bit key from password and salt', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key = await deriveKeyFromPassword('my-password', salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32); // 256 bits
  });

  it('derives the same key for the same password and salt', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key1 = await deriveKeyFromPassword('my-password', salt);
    const key2 = await deriveKeyFromPassword('my-password', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('derives different keys for different passwords', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key1 = await deriveKeyFromPassword('password-1', salt);
    const key2 = await deriveKeyFromPassword('password-2', salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it('derives different keys for different salts', async () => {
    const salt1 = Buffer.from('salt-aaaaaaaaaa');
    const salt2 = Buffer.from('salt-bbbbbbbbbb');
    const key1 = await deriveKeyFromPassword('same-password', salt1);
    const key2 = await deriveKeyFromPassword('same-password', salt2);
    expect(key1.equals(key2)).toBe(false);
  });
});

describe('encrypt / decrypt', () => {
  it('encrypts and decrypts data round-trip', () => {
    const key = Buffer.alloc(32, 0xab);
    const plaintext = JSON.stringify({ secret: 'my-private-key' });
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypted output differs from plaintext', () => {
    const key = Buffer.alloc(32, 0xcd);
    const plaintext = 'hello world';
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const key = Buffer.alloc(32, 0xef);
    const plaintext = 'same data';
    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('fails to decrypt with wrong key', () => {
    const key1 = Buffer.alloc(32, 0x11);
    const key2 = Buffer.alloc(32, 0x22);
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('fails to decrypt tampered data', () => {
    const key = Buffer.alloc(32, 0x33);
    const encrypted = encrypt('secret', key);
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

describe('generateRandomKey', () => {
  it('generates a 32-byte random key', () => {
    const key = generateRandomKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('generates unique keys each time', () => {
    const key1 = generateRandomKey();
    const key2 = generateRandomKey();
    expect(key1.equals(key2)).toBe(false);
  });
});

describe('generateVaultKeyString', () => {
  it('generates a string starting with cv_agent_', () => {
    const keyStr = generateVaultKeyString();
    expect(keyStr).toMatch(/^cv_agent_[a-f0-9]{64}$/);
  });

  it('returns the raw key bytes as second element', () => {
    const { keyString, keyBuffer } = generateVaultKeyString();
    const hexPart = keyString.replace('cv_agent_', '');
    expect(keyBuffer.toString('hex')).toBe(hexPart);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/crypto.test.ts`
Expected: FAIL — module `./crypto.js` does not exist.

**Step 3: Implement the encryption module**

```typescript
// packages/core/src/vault/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, hkdf } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256-bit key
const HKDF_HASH = 'sha256';
const HKDF_INFO = Buffer.from('chainvault-master-key');

/**
 * Derives a 256-bit encryption key from a password and salt using HKDF.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    hkdf(
      HKDF_HASH,
      password,
      salt,
      HKDF_INFO,
      KEY_LENGTH,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(derivedKey));
      },
    );
  });
}

/**
 * Encrypts plaintext with AES-256-GCM. Returns base64-encoded string
 * containing IV + authTag + ciphertext.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext.
 */
export function decrypt(encryptedBase64: string, key: Buffer): string {
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Generates a cryptographically random 256-bit key.
 */
export function generateRandomKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Generates an agent vault key string (cv_agent_<hex>) and its raw Buffer.
 */
export function generateVaultKeyString(): {
  keyString: string;
  keyBuffer: Buffer;
} {
  const keyBuffer = generateRandomKey();
  const keyString = `cv_agent_${keyBuffer.toString('hex')}`;
  return { keyString, keyBuffer };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/vault/crypto.test.ts`
Expected: All 10 tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/vault/crypto.ts packages/core/src/vault/crypto.test.ts
git commit -m "feat(vault): add AES-256-GCM encryption module with HKDF key derivation"
```

---

## Task 3: Vault Types & Data Structures

**Files:**
- Create: `packages/core/src/vault/types.ts`
- Create: `packages/core/src/vault/types.test.ts`

Define and validate all vault data structures with Zod schemas.

**Step 1: Write failing tests**

```typescript
// packages/core/src/vault/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  MasterVaultDataSchema,
  AgentVaultDataSchema,
  AgentConfigSchema,
  TxRulesSchema,
  ApiAccessRuleSchema,
} from './types.js';

describe('TxRulesSchema', () => {
  it('validates valid tx rules', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['deploy', 'write', 'read', 'simulate'],
      limits: {
        '11155111': { max_per_tx: 'unlimited', daily_limit: 'unlimited', monthly_limit: 'unlimited' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tx type', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['hack'],
      limits: {},
    });
    expect(result.success).toBe(false);
  });

  it('validates numeric limits', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['read'],
      limits: {
        '1': { max_per_tx: '0.5', daily_limit: '1.0', monthly_limit: '10.0' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ApiAccessRuleSchema', () => {
  it('validates valid API access rule', () => {
    const result = ApiAccessRuleSchema.safeParse({
      allowed_endpoints: ['getabi', 'getsourcecode'],
      rate_limit: { per_second: 5, daily: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('validates wildcard endpoints', () => {
    const result = ApiAccessRuleSchema.safeParse({
      allowed_endpoints: ['*'],
      rate_limit: { per_second: 10, daily: 10000 },
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentConfigSchema', () => {
  it('validates a full agent config', () => {
    const result = AgentConfigSchema.safeParse({
      name: 'deployer',
      chains: [11155111],
      tx_rules: {
        allowed_types: ['deploy', 'write', 'read', 'simulate'],
        limits: {
          '11155111': { max_per_tx: 'unlimited', daily_limit: 'unlimited', monthly_limit: 'unlimited' },
        },
      },
      api_access: {
        etherscan: {
          allowed_endpoints: ['*'],
          rate_limit: { per_second: 5, daily: 5000 },
        },
      },
      contract_rules: { mode: 'none' },
    });
    expect(result.success).toBe(true);
  });

  it('validates contract whitelist mode', () => {
    const result = AgentConfigSchema.safeParse({
      name: 'reader',
      chains: [1],
      tx_rules: { allowed_types: ['read'], limits: {} },
      api_access: {},
      contract_rules: {
        mode: 'whitelist',
        addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('MasterVaultDataSchema', () => {
  it('validates a minimal master vault', () => {
    const result = MasterVaultDataSchema.safeParse({
      version: 1,
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
      agents: {},
    });
    expect(result.success).toBe(true);
  });

  it('validates master vault with keys and agents', () => {
    const result = MasterVaultDataSchema.safeParse({
      version: 1,
      keys: {
        'my-wallet': {
          private_key: '0xabc123',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chains: [1, 11155111],
        },
      },
      api_keys: {
        etherscan: { key: 'ABCDEF123', base_url: 'https://api.etherscan.io' },
      },
      rpc_endpoints: {
        mainnet: { url: 'https://mainnet.infura.io/v3/KEY', chain_id: 1 },
      },
      agents: {
        deployer: {
          name: 'deployer',
          chains: [11155111],
          tx_rules: { allowed_types: ['deploy', 'read'], limits: {} },
          api_access: {},
          contract_rules: { mode: 'none' },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentVaultDataSchema', () => {
  it('validates an agent vault', () => {
    const result = AgentVaultDataSchema.safeParse({
      version: 1,
      agent_name: 'deployer',
      config: {
        name: 'deployer',
        chains: [11155111],
        tx_rules: { allowed_types: ['deploy', 'read'], limits: {} },
        api_access: {},
        contract_rules: { mode: 'none' },
      },
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
    });
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/types.test.ts`
Expected: FAIL — module `./types.js` does not exist.

**Step 3: Implement vault types**

```typescript
// packages/core/src/vault/types.ts
import { z } from 'zod';

// --- Transaction Types ---

export const TxType = z.enum(['deploy', 'write', 'transfer', 'read', 'simulate']);
export type TxType = z.infer<typeof TxType>;

// --- Limits ---

const LimitValue = z.union([z.literal('unlimited'), z.string().regex(/^\d+\.?\d*$/)]);

const ChainLimits = z.object({
  max_per_tx: LimitValue,
  daily_limit: LimitValue,
  monthly_limit: LimitValue,
});

// --- Rules ---

export const TxRulesSchema = z.object({
  allowed_types: z.array(TxType),
  limits: z.record(z.string(), ChainLimits), // key is chain ID as string
});
export type TxRules = z.infer<typeof TxRulesSchema>;

export const ApiAccessRuleSchema = z.object({
  allowed_endpoints: z.array(z.string()),
  rate_limit: z.object({
    per_second: z.number().int().positive(),
    daily: z.number().int().positive(),
  }),
});
export type ApiAccessRule = z.infer<typeof ApiAccessRuleSchema>;

const ContractRulesSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('whitelist'), addresses: z.array(z.string()) }),
  z.object({ mode: z.literal('blacklist'), addresses: z.array(z.string()) }),
]);

// --- Agent Config ---

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  chains: z.array(z.number().int()),
  tx_rules: TxRulesSchema,
  api_access: z.record(z.string(), ApiAccessRuleSchema),
  contract_rules: ContractRulesSchema,
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// --- Stored Key ---

const StoredKeySchema = z.object({
  private_key: z.string(),
  address: z.string(),
  chains: z.array(z.number().int()),
});

// --- Stored API Key ---

const StoredApiKeySchema = z.object({
  key: z.string(),
  base_url: z.string().url(),
});

// --- Stored RPC Endpoint ---

const StoredRpcEndpointSchema = z.object({
  url: z.string().url(),
  chain_id: z.number().int(),
});

// --- Master Vault ---

export const MasterVaultDataSchema = z.object({
  version: z.literal(1),
  keys: z.record(z.string(), StoredKeySchema),
  api_keys: z.record(z.string(), StoredApiKeySchema),
  rpc_endpoints: z.record(z.string(), StoredRpcEndpointSchema),
  agents: z.record(z.string(), AgentConfigSchema),
});
export type MasterVaultData = z.infer<typeof MasterVaultDataSchema>;

// --- Agent Vault ---

export const AgentVaultDataSchema = z.object({
  version: z.literal(1),
  agent_name: z.string(),
  config: AgentConfigSchema,
  keys: z.record(z.string(), StoredKeySchema),
  api_keys: z.record(z.string(), StoredApiKeySchema),
  rpc_endpoints: z.record(z.string(), StoredRpcEndpointSchema),
});
export type AgentVaultData = z.infer<typeof AgentVaultDataSchema>;
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/vault/types.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/vault/types.ts packages/core/src/vault/types.test.ts
git commit -m "feat(vault): add Zod-validated vault data structures and schemas"
```

---

## Task 4: Master Vault Operations

**Files:**
- Create: `packages/core/src/vault/master-vault.ts`
- Create: `packages/core/src/vault/master-vault.test.ts`

Handles creating, unlocking, locking the master vault, and CRUD operations on keys/API keys/agents.

**Step 1: Write failing tests**

```typescript
// packages/core/src/vault/master-vault.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './master-vault.js';

describe('MasterVault', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('init', () => {
    it('creates a new master vault file', async () => {
      await MasterVault.init(testDir, 'test-password');
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'master.vault'))).toBe(true);
    });

    it('throws if vault already exists', async () => {
      await MasterVault.init(testDir, 'test-password');
      await expect(MasterVault.init(testDir, 'test-password')).rejects.toThrow(
        'already exists',
      );
    });
  });

  describe('unlock / lock', () => {
    it('unlocks with correct password', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      expect(vault.isUnlocked()).toBe(true);
    });

    it('fails to unlock with wrong password', async () => {
      await MasterVault.init(testDir, 'test-password');
      await expect(
        MasterVault.unlock(testDir, 'wrong-password'),
      ).rejects.toThrow();
    });

    it('lock clears sensitive data', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      vault.lock();
      expect(vault.isUnlocked()).toBe(false);
    });

    it('operations fail after lock', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      vault.lock();
      expect(() => vault.listKeys()).toThrow('Vault is locked');
    });
  });

  describe('key management', () => {
    it('adds and lists a key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1, 11155111]);
      const keys = vault.listKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe('my-wallet');
      expect(keys[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      // Private key should NOT be in the list output
      expect(keys[0]).not.toHaveProperty('private_key');
    });

    it('removes a key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1]);
      await vault.removeKey('my-wallet');
      expect(vault.listKeys()).toHaveLength(0);
    });

    it('persists keys across unlock cycles', async () => {
      await MasterVault.init(testDir, 'test-password');
      let vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1]);
      vault.lock();

      vault = await MasterVault.unlock(testDir, 'test-password');
      expect(vault.listKeys()).toHaveLength(1);
    });
  });

  describe('API key management', () => {
    it('adds and lists an API key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
      const apiKeys = vault.listApiKeys();
      expect(apiKeys).toHaveLength(1);
      expect(apiKeys[0].name).toBe('etherscan');
      // Actual key should NOT be in the list output
      expect(apiKeys[0]).not.toHaveProperty('key');
    });

    it('removes an API key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
      await vault.removeApiKey('etherscan');
      expect(vault.listApiKeys()).toHaveLength(0);
    });
  });

  describe('RPC endpoint management', () => {
    it('adds and lists an RPC endpoint', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addRpcEndpoint('mainnet', 'https://mainnet.infura.io/v3/KEY', 1);
      const endpoints = vault.listRpcEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].name).toBe('mainnet');
      expect(endpoints[0].chain_id).toBe(1);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/master-vault.test.ts`
Expected: FAIL — module `./master-vault.js` does not exist.

**Step 3: Implement MasterVault class**

```typescript
// packages/core/src/vault/master-vault.ts
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { privateKeyToAddress } from 'viem/accounts';
import { deriveKeyFromPassword, encrypt, decrypt, generateRandomKey } from './crypto.js';
import { MasterVaultDataSchema, type MasterVaultData } from './types.js';

const VAULT_FILENAME = 'master.vault';
const SALT_FILENAME = 'master.salt';

export class MasterVault {
  private data: MasterVaultData | null = null;
  private masterKey: Buffer | null = null;
  private basePath: string;

  private constructor(basePath: string) {
    this.basePath = basePath;
  }

  static async init(basePath: string, password: string): Promise<void> {
    await mkdir(basePath, { recursive: true });

    const vaultPath = join(basePath, VAULT_FILENAME);
    try {
      await access(vaultPath);
      throw new Error('Vault already exists at this location');
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const salt = generateRandomKey(); // 32 random bytes as salt
    const masterKey = await deriveKeyFromPassword(password, salt);

    const emptyVault: MasterVaultData = {
      version: 1,
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
      agents: {},
    };

    const encrypted = encrypt(JSON.stringify(emptyVault), masterKey);
    await writeFile(join(basePath, SALT_FILENAME), salt);
    await writeFile(vaultPath, encrypted, 'utf8');
  }

  static async unlock(basePath: string, password: string): Promise<MasterVault> {
    const salt = await readFile(join(basePath, SALT_FILENAME));
    const masterKey = await deriveKeyFromPassword(password, salt);

    const encrypted = await readFile(join(basePath, VAULT_FILENAME), 'utf8');
    const decrypted = decrypt(encrypted, masterKey);
    const data = MasterVaultDataSchema.parse(JSON.parse(decrypted));

    const vault = new MasterVault(basePath);
    vault.data = data;
    vault.masterKey = masterKey;
    return vault;
  }

  isUnlocked(): boolean {
    return this.data !== null && this.masterKey !== null;
  }

  lock(): void {
    this.data = null;
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  private requireUnlocked(): MasterVaultData {
    if (!this.data || !this.masterKey) {
      throw new Error('Vault is locked');
    }
    return this.data;
  }

  private async save(): Promise<void> {
    const data = this.requireUnlocked();
    const encrypted = encrypt(JSON.stringify(data), this.masterKey!);
    await writeFile(join(this.basePath, VAULT_FILENAME), encrypted, 'utf8');
  }

  // --- Key Management ---

  async addKey(name: string, privateKey: string, chains: number[]): Promise<void> {
    const data = this.requireUnlocked();
    const address = privateKeyToAddress(privateKey as `0x${string}`);
    data.keys[name] = { private_key: privateKey, address, chains };
    await this.save();
  }

  async removeKey(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.keys[name];
    await this.save();
  }

  listKeys(): Array<{ name: string; address: string; chains: number[] }> {
    const data = this.requireUnlocked();
    return Object.entries(data.keys).map(([name, key]) => ({
      name,
      address: key.address,
      chains: key.chains,
    }));
  }

  // --- API Key Management ---

  async addApiKey(name: string, key: string, baseUrl: string): Promise<void> {
    const data = this.requireUnlocked();
    data.api_keys[name] = { key, base_url: baseUrl };
    await this.save();
  }

  async removeApiKey(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.api_keys[name];
    await this.save();
  }

  listApiKeys(): Array<{ name: string; base_url: string }> {
    const data = this.requireUnlocked();
    return Object.entries(data.api_keys).map(([name, apiKey]) => ({
      name,
      base_url: apiKey.base_url,
    }));
  }

  // --- RPC Endpoint Management ---

  async addRpcEndpoint(name: string, url: string, chainId: number): Promise<void> {
    const data = this.requireUnlocked();
    data.rpc_endpoints[name] = { url, chain_id: chainId };
    await this.save();
  }

  async removeRpcEndpoint(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.rpc_endpoints[name];
    await this.save();
  }

  listRpcEndpoints(): Array<{ name: string; url: string; chain_id: number }> {
    const data = this.requireUnlocked();
    return Object.entries(data.rpc_endpoints).map(([name, ep]) => ({
      name,
      url: ep.url,
      chain_id: ep.chain_id,
    }));
  }

  // --- Agent Config Management (used by Task 5) ---

  getData(): MasterVaultData {
    return this.requireUnlocked();
  }

  async saveData(): Promise<void> {
    await this.save();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/vault/master-vault.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/vault/master-vault.ts packages/core/src/vault/master-vault.test.ts
git commit -m "feat(vault): add MasterVault with init, unlock, lock, key/api/rpc CRUD"
```

---

## Task 5: Agent Vault Operations

**Files:**
- Create: `packages/core/src/vault/agent-vault.ts`
- Create: `packages/core/src/vault/agent-vault.test.ts`

Creates, manages, and regenerates agent vaults from master vault data.

**Step 1: Write failing tests**

```typescript
// packages/core/src/vault/agent-vault.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './master-vault.js';
import { AgentVaultManager } from './agent-vault.js';
import type { AgentConfig } from './types.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const DEPLOYER_CONFIG: AgentConfig = {
  name: 'deployer',
  chains: [11155111],
  tx_rules: {
    allowed_types: ['deploy', 'write', 'read', 'simulate'],
    limits: {},
  },
  api_access: {
    etherscan: {
      allowed_endpoints: ['*'],
      rate_limit: { per_second: 5, daily: 5000 },
    },
  },
  contract_rules: { mode: 'none' },
};

describe('AgentVaultManager', () => {
  let testDir: string;
  let masterVault: MasterVault;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-agent-test-'));
    await MasterVault.init(testDir, 'test-password');
    masterVault = await MasterVault.unlock(testDir, 'test-password');
    await masterVault.addKey('my-wallet', TEST_PRIVATE_KEY, [1, 11155111]);
    await masterVault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
  });

  afterEach(async () => {
    masterVault.lock();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createAgent', () => {
    it('creates an agent vault and returns the vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      expect(result.vaultKey).toMatch(/^cv_agent_[a-f0-9]{64}$/);
    });

    it('creates the agent vault file on disk', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'agents', 'deployer.vault'))).toBe(true);
    });

    it('agent vault only contains granted keys', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(Object.keys(agentData.keys)).toEqual(['my-wallet']);
      expect(Object.keys(agentData.api_keys)).toEqual([]);
    });

    it('agent vault contains granted API keys', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, [], ['etherscan']);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(Object.keys(agentData.api_keys)).toEqual(['etherscan']);
      expect(Object.keys(agentData.keys)).toEqual([]);
    });
  });

  describe('openAgentVault', () => {
    it('opens with correct vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(agentData.agent_name).toBe('deployer');
    });

    it('fails with wrong vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await expect(
        manager.openAgentVault('deployer', 'cv_agent_0000000000000000000000000000000000000000000000000000000000000000'),
      ).rejects.toThrow();
    });
  });

  describe('rotateAgentKey', () => {
    it('returns a new vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const original = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      const rotated = await manager.rotateAgentKey('deployer', original.vaultKey);
      expect(rotated.vaultKey).toMatch(/^cv_agent_[a-f0-9]{64}$/);
      expect(rotated.vaultKey).not.toBe(original.vaultKey);
    });

    it('old key no longer works after rotation', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const original = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await manager.rotateAgentKey('deployer', original.vaultKey);
      await expect(
        manager.openAgentVault('deployer', original.vaultKey),
      ).rejects.toThrow();
    });
  });

  describe('revokeAgent', () => {
    it('deletes the agent vault file', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await manager.revokeAgent('deployer');
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'agents', 'deployer.vault'))).toBe(false);
    });
  });

  describe('listAgents', () => {
    it('lists all agents with summaries', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const agents = manager.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('deployer');
      expect(agents[0].chains).toEqual([11155111]);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/agent-vault.test.ts`
Expected: FAIL — module `./agent-vault.js` does not exist.

**Step 3: Implement AgentVaultManager**

```typescript
// packages/core/src/vault/agent-vault.ts
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, decrypt, generateVaultKeyString } from './crypto.js';
import { AgentVaultDataSchema, type AgentVaultData, type AgentConfig } from './types.js';
import type { MasterVault } from './master-vault.js';

const AGENTS_DIR = 'agents';

export class AgentVaultManager {
  private basePath: string;
  private masterVault: MasterVault;

  constructor(basePath: string, masterVault: MasterVault) {
    this.basePath = basePath;
    this.masterVault = masterVault;
  }

  async createAgent(
    config: AgentConfig,
    grantedKeys: string[],
    grantedApiKeys: string[],
  ): Promise<{ vaultKey: string }> {
    const masterData = this.masterVault.getData();

    // Store agent config in master vault
    masterData.agents[config.name] = config;
    await this.masterVault.saveData();

    // Build agent vault data with only granted secrets
    const keys: AgentVaultData['keys'] = {};
    for (const keyName of grantedKeys) {
      if (masterData.keys[keyName]) {
        keys[keyName] = masterData.keys[keyName];
      }
    }

    const apiKeys: AgentVaultData['api_keys'] = {};
    for (const apiKeyName of grantedApiKeys) {
      if (masterData.api_keys[apiKeyName]) {
        apiKeys[apiKeyName] = masterData.api_keys[apiKeyName];
      }
    }

    // Collect RPC endpoints matching agent's allowed chains
    const rpcEndpoints: AgentVaultData['rpc_endpoints'] = {};
    for (const [name, ep] of Object.entries(masterData.rpc_endpoints)) {
      if (config.chains.includes(ep.chain_id)) {
        rpcEndpoints[name] = ep;
      }
    }

    const agentVaultData: AgentVaultData = {
      version: 1,
      agent_name: config.name,
      config,
      keys,
      api_keys: apiKeys,
      rpc_endpoints: rpcEndpoints,
    };

    // Generate vault key and encrypt
    const { keyString, keyBuffer } = generateVaultKeyString();
    const encrypted = encrypt(JSON.stringify(agentVaultData), keyBuffer);

    const agentsDir = join(this.basePath, AGENTS_DIR);
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, `${config.name}.vault`), encrypted, 'utf8');

    return { vaultKey: keyString };
  }

  async openAgentVault(
    agentName: string,
    vaultKey: string,
  ): Promise<AgentVaultData> {
    const hexPart = vaultKey.replace('cv_agent_', '');
    const keyBuffer = Buffer.from(hexPart, 'hex');

    const encrypted = await readFile(
      join(this.basePath, AGENTS_DIR, `${agentName}.vault`),
      'utf8',
    );
    const decrypted = decrypt(encrypted, keyBuffer);
    return AgentVaultDataSchema.parse(JSON.parse(decrypted));
  }

  async rotateAgentKey(
    agentName: string,
    currentVaultKey: string,
  ): Promise<{ vaultKey: string }> {
    // Open with current key to get data
    const agentData = await this.openAgentVault(agentName, currentVaultKey);

    // Re-encrypt with new key
    const { keyString, keyBuffer } = generateVaultKeyString();
    const encrypted = encrypt(JSON.stringify(agentData), keyBuffer);

    await writeFile(
      join(this.basePath, AGENTS_DIR, `${agentName}.vault`),
      encrypted,
      'utf8',
    );

    return { vaultKey: keyString };
  }

  async revokeAgent(agentName: string): Promise<void> {
    const vaultPath = join(this.basePath, AGENTS_DIR, `${agentName}.vault`);
    await rm(vaultPath, { force: true });

    const masterData = this.masterVault.getData();
    delete masterData.agents[agentName];
    await this.masterVault.saveData();
  }

  listAgents(): Array<{ name: string; chains: number[]; allowed_types: string[] }> {
    const masterData = this.masterVault.getData();
    return Object.values(masterData.agents).map((config) => ({
      name: config.name,
      chains: config.chains,
      allowed_types: config.tx_rules.allowed_types,
    }));
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/vault/agent-vault.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/vault/agent-vault.ts packages/core/src/vault/agent-vault.test.ts
git commit -m "feat(vault): add AgentVaultManager with create, open, rotate, revoke"
```

---

## Task 6: Audit Logger

**Files:**
- Create: `packages/core/src/audit/logger.ts`
- Create: `packages/core/src/audit/logger.test.ts`

Logs all agent requests (approved and denied) with no secrets.

**Step 1: Write failing tests**

```typescript
// packages/core/src/audit/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogger, type AuditEntry } from './logger.js';

describe('AuditLogger', () => {
  let testDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-audit-'));
    logger = new AuditLogger(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('logs an approved action', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'Deployed contract to Sepolia',
    });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('deployer');
    expect(entries[0].status).toBe('approved');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('logs a denied action', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 1,
      status: 'denied',
      details: 'Chain 1 not in allowed chains',
    });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('denied');
  });

  it('accumulates multiple entries', async () => {
    await logger.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'b', action: 'write', chain_id: 1, status: 'denied', details: '' });
    await logger.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(3);
  });

  it('filters by agent name', async () => {
    await logger.log({ agent: 'deployer', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'reader', action: 'read', chain_id: 1, status: 'approved', details: '' });

    const filtered = await logger.getEntries({ agent: 'deployer' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].agent).toBe('deployer');
  });

  it('filters by status', async () => {
    await logger.log({ agent: 'a', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'a', action: 'write', chain_id: 1, status: 'denied', details: '' });

    const denied = await logger.getEntries({ status: 'denied' });
    expect(denied).toHaveLength(1);
    expect(denied[0].status).toBe('denied');
  });

  it('never contains secrets in log output', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'tx: 0xabc123',
    });

    const raw = await readFile(join(testDir, 'audit.log'), 'utf8');
    expect(raw).not.toContain('private_key');
    expect(raw).not.toContain('0xac0974bec39a17');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/audit/logger.test.ts`
Expected: FAIL — module `./logger.js` does not exist.

**Step 3: Implement AuditLogger**

```typescript
// packages/core/src/audit/logger.ts
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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

const LOG_FILENAME = 'audit.log';

export class AuditLogger {
  private logPath: string;

  constructor(basePath: string) {
    this.logPath = join(basePath, LOG_FILENAME);
  }

  async log(entry: LogInput): Promise<void> {
    const full: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    const line = JSON.stringify(full) + '\n';
    await mkdir(join(this.logPath, '..'), { recursive: true });
    await appendFile(this.logPath, line, 'utf8');
  }

  async getEntries(filter?: FilterOptions): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch {
      return [];
    }

    const entries: AuditEntry[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    if (!filter) return entries;

    return entries.filter((e) => {
      if (filter.agent && e.agent !== filter.agent) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/audit/logger.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/audit/logger.ts packages/core/src/audit/logger.test.ts
git commit -m "feat(audit): add AuditLogger with append-only log and filtering"
```

---

## Task 7: Rules Engine

**Files:**
- Create: `packages/core/src/rules/engine.ts`
- Create: `packages/core/src/rules/engine.test.ts`

Evaluates agent requests against their vault rules before any secret is decrypted.

**Step 1: Write failing tests**

```typescript
// packages/core/src/rules/engine.test.ts
import { describe, it, expect } from 'vitest';
import { RulesEngine, type TxRequest, type ApiRequest } from './engine.js';
import type { AgentConfig } from '../vault/types.js';

const DEPLOYER_CONFIG: AgentConfig = {
  name: 'deployer',
  chains: [11155111],
  tx_rules: {
    allowed_types: ['deploy', 'write', 'read', 'simulate'],
    limits: {
      '11155111': { max_per_tx: '1.0', daily_limit: '5.0', monthly_limit: '50.0' },
    },
  },
  api_access: {
    etherscan: {
      allowed_endpoints: ['getabi', 'getsourcecode'],
      rate_limit: { per_second: 5, daily: 5000 },
    },
  },
  contract_rules: { mode: 'none' },
};

const READER_CONFIG: AgentConfig = {
  name: 'reader',
  chains: [1, 11155111],
  tx_rules: {
    allowed_types: ['read', 'simulate'],
    limits: {},
  },
  api_access: {},
  contract_rules: {
    mode: 'whitelist',
    addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
  },
};

describe('RulesEngine', () => {
  describe('checkTxRequest', () => {
    it('approves a valid deploy request', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 11155111,
        value: '0.5',
      });
      expect(result.approved).toBe(true);
    });

    it('denies request for unauthorized chain', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 1, // mainnet not in deployer's chains
        value: '0',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('chain');
    });

    it('denies request for unauthorized tx type', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 1,
        value: '0',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('type');
    });

    it('denies request exceeding per-tx limit', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '1.5', // exceeds max_per_tx of 1.0
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('per-tx limit');
    });

    it('approves request within per-tx limit', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '0.9',
      });
      expect(result.approved).toBe(true);
    });

    it('always approves read requests', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
      });
      expect(result.approved).toBe(true);
    });

    it('denies write to non-whitelisted contract', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
        to_address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('whitelist');
    });

    it('approves request to whitelisted contract', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
        to_address: '0x1234567890abcdef1234567890abcdef12345678',
      });
      expect(result.approved).toBe(true);
    });

    it('tracks daily spending and denies when exceeded', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);

      // Spend 4.5 across multiple txs
      engine.recordSpend(11155111, 4.5);

      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '1.0', // 4.5 + 1.0 = 5.5 > daily_limit of 5.0
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('daily limit');
    });
  });

  describe('checkApiRequest', () => {
    it('approves a valid API request', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'getabi',
      });
      expect(result.approved).toBe(true);
    });

    it('denies request for unauthorized service', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'coingecko',
        endpoint: 'price',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('service');
    });

    it('denies request for non-whitelisted endpoint', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'sendrawtransaction',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('endpoint');
    });

    it('approves wildcard endpoints', () => {
      const config: AgentConfig = {
        ...DEPLOYER_CONFIG,
        api_access: {
          etherscan: {
            allowed_endpoints: ['*'],
            rate_limit: { per_second: 5, daily: 5000 },
          },
        },
      };
      const engine = new RulesEngine(config);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'anything',
      });
      expect(result.approved).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/rules/engine.test.ts`
Expected: FAIL — module `./engine.js` does not exist.

**Step 3: Implement RulesEngine**

```typescript
// packages/core/src/rules/engine.ts
import type { AgentConfig } from '../vault/types.js';

export interface TxRequest {
  type: 'deploy' | 'write' | 'transfer' | 'read' | 'simulate';
  chain_id: number;
  value: string; // in native token (e.g., ETH)
  to_address?: string;
}

export interface ApiRequest {
  service: string;
  endpoint: string;
}

export interface RuleResult {
  approved: boolean;
  reason?: string;
}

interface SpendRecord {
  amount: number;
  timestamp: number;
}

export class RulesEngine {
  private config: AgentConfig;
  private spendHistory: Map<number, SpendRecord[]> = new Map(); // chain_id -> records

  constructor(config: AgentConfig) {
    this.config = config;
  }

  checkTxRequest(request: TxRequest): RuleResult {
    // 1. Check chain access
    if (!this.config.chains.includes(request.chain_id)) {
      return { approved: false, reason: `Agent does not have access to chain ${request.chain_id}` };
    }

    // 2. Check tx type
    if (!this.config.tx_rules.allowed_types.includes(request.type)) {
      return { approved: false, reason: `Transaction type '${request.type}' is not allowed` };
    }

    // 3. Check contract rules (if target address provided)
    if (request.to_address) {
      const contractResult = this.checkContractRules(request.to_address);
      if (!contractResult.approved) return contractResult;
    }

    // 4. Check spend limits (skip for read/simulate)
    if (request.type !== 'read' && request.type !== 'simulate') {
      const limitResult = this.checkSpendLimits(request.chain_id, parseFloat(request.value));
      if (!limitResult.approved) return limitResult;
    }

    return { approved: true };
  }

  checkApiRequest(request: ApiRequest): RuleResult {
    const rule = this.config.api_access[request.service];
    if (!rule) {
      return { approved: false, reason: `Agent does not have access to service '${request.service}'` };
    }

    // Check endpoint whitelist
    if (!rule.allowed_endpoints.includes('*') && !rule.allowed_endpoints.includes(request.endpoint)) {
      return { approved: false, reason: `Endpoint '${request.endpoint}' is not in the allowed endpoint list for '${request.service}'` };
    }

    return { approved: true };
  }

  recordSpend(chainId: number, amount: number): void {
    const records = this.spendHistory.get(chainId) || [];
    records.push({ amount, timestamp: Date.now() });
    this.spendHistory.set(chainId, records);
  }

  private checkContractRules(address: string): RuleResult {
    const rules = this.config.contract_rules;
    if (rules.mode === 'none') return { approved: true };

    const normalizedAddress = address.toLowerCase();

    if (rules.mode === 'whitelist') {
      const allowed = rules.addresses.some(
        (a) => a.toLowerCase() === normalizedAddress,
      );
      if (!allowed) {
        return { approved: false, reason: `Address ${address} is not in the contract whitelist` };
      }
    }

    if (rules.mode === 'blacklist') {
      const blocked = rules.addresses.some(
        (a) => a.toLowerCase() === normalizedAddress,
      );
      if (blocked) {
        return { approved: false, reason: `Address ${address} is in the contract blacklist` };
      }
    }

    return { approved: true };
  }

  private checkSpendLimits(chainId: number, value: number): RuleResult {
    const chainKey = chainId.toString();
    const limits = this.config.tx_rules.limits[chainKey];
    if (!limits) return { approved: true }; // no limits configured

    // Per-tx limit
    if (limits.max_per_tx !== 'unlimited') {
      const maxPerTx = parseFloat(limits.max_per_tx);
      if (value > maxPerTx) {
        return { approved: false, reason: `Value ${value} exceeds per-tx limit of ${maxPerTx}` };
      }
    }

    // Daily limit
    if (limits.daily_limit !== 'unlimited') {
      const dailyMax = parseFloat(limits.daily_limit);
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const dailySpent = this.getSpentSince(chainId, dayAgo);
      if (dailySpent + value > dailyMax) {
        return { approved: false, reason: `Would exceed daily limit of ${dailyMax} (spent: ${dailySpent}, requested: ${value})` };
      }
    }

    // Monthly limit
    if (limits.monthly_limit !== 'unlimited') {
      const monthlyMax = parseFloat(limits.monthly_limit);
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const monthlySpent = this.getSpentSince(chainId, monthAgo);
      if (monthlySpent + value > monthlyMax) {
        return { approved: false, reason: `Would exceed monthly limit of ${monthlyMax} (spent: ${monthlySpent}, requested: ${value})` };
      }
    }

    return { approved: true };
  }

  private getSpentSince(chainId: number, since: number): number {
    const records = this.spendHistory.get(chainId) || [];
    return records
      .filter((r) => r.timestamp >= since)
      .reduce((sum, r) => sum + r.amount, 0);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/rules/engine.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/rules/engine.ts packages/core/src/rules/engine.test.ts
git commit -m "feat(rules): add RulesEngine with chain, tx type, spend limit, contract, and API enforcement"
```

---

## Task 8: Chain Module — EVM Adapter (Read Operations)

**Files:**
- Create: `packages/core/src/chain/types.ts`
- Create: `packages/core/src/chain/evm-adapter.ts`
- Create: `packages/core/src/chain/evm-adapter.test.ts`

Chain-agnostic interface with EVM implementation. Read operations first (no signing needed).

**Step 1: Write failing tests**

```typescript
// packages/core/src/chain/evm-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvmAdapter } from './evm-adapter.js';
import type { ChainAdapter } from './types.js';

// We mock viem to avoid needing a real RPC
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: vi.fn(async () => 1000000000000000000n), // 1 ETH
      readContract: vi.fn(async () => 'MockResult'),
      simulateContract: vi.fn(async () => ({ result: true })),
      getContractEvents: vi.fn(async () => [
        { eventName: 'Transfer', args: { from: '0x1', to: '0x2', value: 100n } },
      ]),
      getTransaction: vi.fn(async () => ({
        hash: '0xabc',
        from: '0x1',
        to: '0x2',
        value: 0n,
        blockNumber: 1000n,
      })),
      getTransactionReceipt: vi.fn(async () => ({
        status: 'success',
        gasUsed: 21000n,
      })),
      estimateGas: vi.fn(async () => 21000n),
      getGasPrice: vi.fn(async () => 30000000000n),
    })),
    http: vi.fn(() => 'http-transport'),
  };
});

describe('EvmAdapter - Read Operations', () => {
  let adapter: ChainAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('gets balance', async () => {
    const result = await adapter.getBalance('0x1234567890abcdef1234567890abcdef12345678');
    expect(result).toBeDefined();
    expect(result.wei).toBe('1000000000000000000');
    expect(result.formatted).toBe('1.0');
  });

  it('reads contract state', async () => {
    const result = await adapter.readContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'totalSupply',
      args: [],
    });
    expect(result).toBe('MockResult');
  });

  it('simulates a transaction', async () => {
    const result = await adapter.simulateTransaction({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      account: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(result.success).toBe(true);
  });

  it('gets contract events', async () => {
    const result = await adapter.getEvents({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ name: 'Transfer', type: 'event', inputs: [] }],
      eventName: 'Transfer',
    });
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe('Transfer');
  });

  it('gets transaction details', async () => {
    const result = await adapter.getTransaction('0xabc');
    expect(result.hash).toBe('0xabc');
    expect(result.receipt.status).toBe('success');
  });

  it('estimates gas cost', async () => {
    const estimate = await adapter.estimateGas({
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '0',
    });
    expect(estimate.gasLimit).toBeDefined();
    expect(estimate.gasPriceGwei).toBeDefined();
    expect(estimate.estimatedCostEth).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/chain/evm-adapter.test.ts`
Expected: FAIL — modules do not exist.

**Step 3: Implement chain types**

```typescript
// packages/core/src/chain/types.ts

export interface BalanceResult {
  wei: string;
  formatted: string;
}

export interface ReadContractParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
}

export interface SimulateParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
  account: string;
  value?: string;
}

export interface SimulateResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface EventParams {
  address: string;
  abi: any[];
  eventName: string;
  fromBlock?: bigint;
  toBlock?: bigint;
  args?: Record<string, any>;
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  receipt: {
    status: string;
    gasUsed: string;
  };
}

export interface GasEstimate {
  gasLimit: string;
  gasPriceGwei: string;
  estimatedCostEth: string;
}

export interface EstimateGasParams {
  to: string;
  value: string;
  data?: string;
}

export interface DeployParams {
  abi: any[];
  bytecode: string;
  args?: any[];
  privateKey: string;
}

export interface WriteContractParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
  privateKey: string;
  value?: string;
}

/**
 * Chain-agnostic adapter interface. Implement for each chain family.
 */
export interface ChainAdapter {
  chainId: number;
  getBalance(address: string): Promise<BalanceResult>;
  readContract(params: ReadContractParams): Promise<any>;
  simulateTransaction(params: SimulateParams): Promise<SimulateResult>;
  getEvents(params: EventParams): Promise<any[]>;
  getTransaction(hash: string): Promise<TransactionResult>;
  estimateGas(params: EstimateGasParams): Promise<GasEstimate>;
  deployContract(params: DeployParams): Promise<{ hash: string; address?: string }>;
  writeContract(params: WriteContractParams): Promise<{ hash: string }>;
}
```

**Step 4: Implement EvmAdapter**

```typescript
// packages/core/src/chain/evm-adapter.ts
import { createPublicClient, http, formatEther, formatGwei, type PublicClient } from 'viem';
import type {
  ChainAdapter,
  BalanceResult,
  ReadContractParams,
  SimulateParams,
  SimulateResult,
  EventParams,
  TransactionResult,
  GasEstimate,
  EstimateGasParams,
  DeployParams,
  WriteContractParams,
} from './types.js';

export class EvmAdapter implements ChainAdapter {
  chainId: number;
  private client: PublicClient;

  constructor(rpcUrl: string, chainId: number) {
    this.chainId = chainId;
    this.client = createPublicClient({
      transport: http(rpcUrl),
    });
  }

  async getBalance(address: string): Promise<BalanceResult> {
    const balance = await this.client.getBalance({ address: address as `0x${string}` });
    return {
      wei: balance.toString(),
      formatted: formatEther(balance),
    };
  }

  async readContract(params: ReadContractParams): Promise<any> {
    return this.client.readContract({
      address: params.address as `0x${string}`,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    });
  }

  async simulateTransaction(params: SimulateParams): Promise<SimulateResult> {
    try {
      const result = await this.client.simulateContract({
        address: params.address as `0x${string}`,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        account: params.account as `0x${string}`,
      });
      return { success: true, result: result.result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getEvents(params: EventParams): Promise<any[]> {
    return this.client.getContractEvents({
      address: params.address as `0x${string}`,
      abi: params.abi,
      eventName: params.eventName,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      args: params.args,
    });
  }

  async getTransaction(hash: string): Promise<TransactionResult> {
    const tx = await this.client.getTransaction({ hash: hash as `0x${string}` });
    const receipt = await this.client.getTransactionReceipt({ hash: hash as `0x${string}` });
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to ?? null,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber.toString(),
      receipt: {
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
    };
  }

  async estimateGas(params: EstimateGasParams): Promise<GasEstimate> {
    const gasLimit = await this.client.estimateGas({
      to: params.to as `0x${string}`,
      value: BigInt(params.value || '0'),
      data: params.data as `0x${string}` | undefined,
    });
    const gasPrice = await this.client.getGasPrice();
    const estimatedCost = gasLimit * gasPrice;

    return {
      gasLimit: gasLimit.toString(),
      gasPriceGwei: formatGwei(gasPrice),
      estimatedCostEth: formatEther(estimatedCost),
    };
  }

  // Write operations — implemented in Task 9
  async deployContract(_params: DeployParams): Promise<{ hash: string; address?: string }> {
    throw new Error('Not implemented yet — see Task 9');
  }

  async writeContract(_params: WriteContractParams): Promise<{ hash: string }> {
    throw new Error('Not implemented yet — see Task 9');
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/chain/evm-adapter.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add packages/core/src/chain/types.ts packages/core/src/chain/evm-adapter.ts packages/core/src/chain/evm-adapter.test.ts
git commit -m "feat(chain): add ChainAdapter interface and EvmAdapter read operations"
```

---

## Task 9: Chain Module — EVM Adapter (Write Operations)

**Files:**
- Modify: `packages/core/src/chain/evm-adapter.ts`
- Create: `packages/core/src/chain/evm-write.test.ts`

Adds `deployContract` and `writeContract` — these require signing with a private key that is passed in and wiped after use.

**Step 1: Write failing tests**

```typescript
// packages/core/src/chain/evm-write.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvmAdapter } from './evm-adapter.js';

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'success',
        contractAddress: '0xNewContractAddress',
      })),
    })),
    createWalletClient: vi.fn(() => ({
      deployContract: vi.fn(async () => '0xDeployTxHash'),
      writeContract: vi.fn(async () => '0xWriteTxHash'),
    })),
    http: vi.fn(() => 'http-transport'),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  })),
}));

describe('EvmAdapter - Write Operations', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('deploys a contract and returns hash', async () => {
    const result = await adapter.deployContract({
      abi: [{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' }],
      bytecode: '0x608060405260405161083e',
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });
    expect(result.hash).toBe('0xDeployTxHash');
  });

  it('writes to a contract and returns hash', async () => {
    const result = await adapter.writeContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });
    expect(result.hash).toBe('0xWriteTxHash');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/chain/evm-write.test.ts`
Expected: FAIL — "Not implemented yet".

**Step 3: Implement write operations in EvmAdapter**

Replace the placeholder methods in `packages/core/src/chain/evm-adapter.ts`:

```typescript
// Add these imports at the top of evm-adapter.ts
import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Replace the two placeholder methods with:

  async deployContract(params: DeployParams): Promise<{ hash: string; address?: string }> {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      transport: http(undefined), // uses same RPC
    });

    const hash = await walletClient.deployContract({
      abi: params.abi,
      bytecode: params.bytecode as `0x${string}`,
      args: params.args || [],
      account,
    });

    // Wait for receipt to get contract address
    const receipt = await this.client.waitForTransactionReceipt({ hash });

    return {
      hash,
      address: receipt.contractAddress ?? undefined,
    };
  }

  async writeContract(params: WriteContractParams): Promise<{ hash: string }> {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      transport: http(undefined),
    });

    const hash = await walletClient.writeContract({
      address: params.address as `0x${string}`,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      account,
      value: params.value ? BigInt(params.value) : undefined,
    });

    return { hash };
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/chain/evm-write.test.ts`
Expected: All tests PASS.

**Step 5: Run ALL chain tests**

Run: `npx vitest run packages/core/src/chain/`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add packages/core/src/chain/evm-adapter.ts packages/core/src/chain/evm-write.test.ts
git commit -m "feat(chain): add deployContract and writeContract to EvmAdapter"
```

---

## Task 10: API Proxy Module

**Files:**
- Create: `packages/core/src/proxy/api-proxy.ts`
- Create: `packages/core/src/proxy/api-proxy.test.ts`

Proxies API calls through the vault, enforcing rate limits and caching.

**Step 1: Write failing tests**

```typescript
// packages/core/src/proxy/api-proxy.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiProxy } from './api-proxy.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ApiProxy', () => {
  let proxy: ApiProxy;

  beforeEach(() => {
    proxy = new ApiProxy();
    mockFetch.mockReset();
  });

  it('makes an API request with the provided key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: [{ abi: '[]' }] }),
    });

    const result = await proxy.request({
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
      apiKey: 'TEST_KEY',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apikey=TEST_KEY');
    expect(result.status).toBe('1');
  });

  it('caches identical requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'cached-data' }),
    });

    const params = {
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
      apiKey: 'TEST_KEY',
    };

    await proxy.request(params);
    await proxy.request(params);

    expect(mockFetch).toHaveBeenCalledTimes(1); // second call uses cache
  });

  it('enforces per-second rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    const params = {
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
      rateLimits: { per_second: 2, daily: 1000 },
    };

    await proxy.request(params); // 1
    await proxy.request({ ...params, params: { action: 'test2' } }); // 2

    await expect(
      proxy.request({ ...params, params: { action: 'test3' } }), // 3 — exceeds
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('tracks usage per service', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    await proxy.request({
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
    });

    const usage = proxy.getUsage('https://api.etherscan.io');
    expect(usage.totalRequests).toBe(1);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      proxy.request({
        baseUrl: 'https://api.etherscan.io',
        endpoint: '/api',
        params: {},
        apiKey: 'KEY',
      }),
    ).rejects.toThrow('403');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/proxy/api-proxy.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement ApiProxy**

```typescript
// packages/core/src/proxy/api-proxy.ts

interface RequestParams {
  baseUrl: string;
  endpoint: string;
  params: Record<string, string>;
  apiKey: string;
  rateLimits?: { per_second: number; daily: number };
}

interface UsageInfo {
  totalRequests: number;
  requestsLastSecond: number;
  requestsToday: number;
}

interface RateTracker {
  timestamps: number[];
  dailyCount: number;
  dailyResetAt: number;
}

export class ApiProxy {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private rateLimiters: Map<string, RateTracker> = new Map();
  private usageCounters: Map<string, number> = new Map();

  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async request(params: RequestParams): Promise<any> {
    // Check cache
    const cacheKey = this.buildCacheKey(params);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Check rate limits
    if (params.rateLimits) {
      this.enforceRateLimit(params.baseUrl, params.rateLimits);
    }

    // Build URL
    const url = new URL(params.endpoint, params.baseUrl);
    for (const [key, value] of Object.entries(params.params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('apikey', params.apiKey);

    // Make request
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache result
    this.cache.set(cacheKey, { data, expiry: Date.now() + ApiProxy.CACHE_TTL });

    // Track usage
    this.trackUsage(params.baseUrl);

    return data;
  }

  getUsage(baseUrl: string): UsageInfo {
    const tracker = this.rateLimiters.get(baseUrl);
    const total = this.usageCounters.get(baseUrl) || 0;
    const now = Date.now();

    return {
      totalRequests: total,
      requestsLastSecond: tracker
        ? tracker.timestamps.filter((t) => now - t < 1000).length
        : 0,
      requestsToday: tracker?.dailyCount || 0,
    };
  }

  private buildCacheKey(params: RequestParams): string {
    return `${params.baseUrl}${params.endpoint}?${JSON.stringify(params.params)}`;
  }

  private enforceRateLimit(
    baseUrl: string,
    limits: { per_second: number; daily: number },
  ): void {
    const now = Date.now();
    let tracker = this.rateLimiters.get(baseUrl);

    if (!tracker) {
      tracker = { timestamps: [], dailyCount: 0, dailyResetAt: now + 86400000 };
      this.rateLimiters.set(baseUrl, tracker);
    }

    // Reset daily counter
    if (now > tracker.dailyResetAt) {
      tracker.dailyCount = 0;
      tracker.dailyResetAt = now + 86400000;
    }

    // Clean old timestamps (older than 1 second)
    tracker.timestamps = tracker.timestamps.filter((t) => now - t < 1000);

    // Check per-second
    if (tracker.timestamps.length >= limits.per_second) {
      throw new Error(
        `Rate limit exceeded: ${limits.per_second} requests per second for ${baseUrl}`,
      );
    }

    // Check daily
    if (tracker.dailyCount >= limits.daily) {
      throw new Error(
        `Rate limit exceeded: ${limits.daily} requests per day for ${baseUrl}`,
      );
    }

    tracker.timestamps.push(now);
    tracker.dailyCount++;
  }

  private trackUsage(baseUrl: string): void {
    const current = this.usageCounters.get(baseUrl) || 0;
    this.usageCounters.set(baseUrl, current + 1);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/proxy/api-proxy.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/proxy/api-proxy.ts packages/core/src/proxy/api-proxy.test.ts
git commit -m "feat(proxy): add ApiProxy with caching, rate limiting, and usage tracking"
```

---

## Task 11: MCP Server & Tool Registration

**Files:**
- Create: `packages/core/src/mcp/server.ts`
- Create: `packages/core/src/mcp/tools/vault-tools.ts`
- Create: `packages/core/src/mcp/tools/chain-tools.ts`
- Create: `packages/core/src/mcp/tools/proxy-tools.ts`
- Create: `packages/core/src/mcp/server.test.ts`

Wires all modules together into the MCP server with tool definitions.

**Step 1: Write failing tests**

```typescript
// packages/core/src/mcp/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChainVaultServer } from './server.js';

describe('ChainVaultServer', () => {
  it('creates a server instance', () => {
    const server = new ChainVaultServer({ basePath: '/tmp/test' });
    expect(server).toBeDefined();
  });

  it('registers all expected tools', () => {
    const server = new ChainVaultServer({ basePath: '/tmp/test' });
    const toolNames = server.getRegisteredToolNames();

    // Vault tools
    expect(toolNames).toContain('list_chains');
    expect(toolNames).toContain('list_capabilities');
    expect(toolNames).toContain('get_agent_address');

    // Chain tools
    expect(toolNames).toContain('deploy_contract');
    expect(toolNames).toContain('interact_contract');
    expect(toolNames).toContain('get_balance');
    expect(toolNames).toContain('get_contract_state');
    expect(toolNames).toContain('simulate_transaction');
    expect(toolNames).toContain('get_events');
    expect(toolNames).toContain('get_transaction');
    expect(toolNames).toContain('verify_contract');

    // Proxy tools
    expect(toolNames).toContain('query_explorer');
    expect(toolNames).toContain('query_price');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/server.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement vault tools**

```typescript
// packages/core/src/mcp/tools/vault-tools.ts
import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';

export function registerVaultTools(server: McpServer): void {
  server.registerTool(
    'list_chains',
    {
      title: 'List Accessible Chains',
      description: 'Show which blockchain networks this agent has access to',
      inputSchema: z.object({}),
    },
    async () => {
      // Implementation will be wired in integration
      return { content: [{ type: 'text' as const, text: '[]' }] };
    },
  );

  server.registerTool(
    'list_capabilities',
    {
      title: 'List Agent Capabilities',
      description: 'Show what actions this agent is allowed to perform, including transaction types and API access',
      inputSchema: z.object({}),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '{}' }] };
    },
  );

  server.registerTool(
    'get_agent_address',
    {
      title: 'Get Agent Wallet Address',
      description: 'Get the wallet address for a given chain. Returns public address only, never private keys.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('The chain ID to get the address for'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
```

**Step 4: Implement chain tools**

```typescript
// packages/core/src/mcp/tools/chain-tools.ts
import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';

export function registerChainTools(server: McpServer): void {
  server.registerTool(
    'deploy_contract',
    {
      title: 'Deploy Smart Contract',
      description: 'Deploy compiled bytecode to a blockchain. Checks rules, estimates gas, and returns deployment hash and contract address.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Target chain ID'),
        abi: z.string().describe('Contract ABI as JSON string'),
        bytecode: z.string().describe('Compiled contract bytecode (0x-prefixed)'),
        constructor_args: z.array(z.any()).optional().describe('Constructor arguments'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'interact_contract',
    {
      title: 'Write to Smart Contract',
      description: 'Call a state-changing function on a deployed contract. Simulates first, then sends if safe.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Target chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('Function to call'),
        args: z.array(z.any()).optional().describe('Function arguments'),
        value: z.string().optional().describe('Native token value to send (in ETH)'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'verify_contract',
    {
      title: 'Verify Contract Source',
      description: 'Verify contract source code on a block explorer (e.g., Etherscan)',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Deployed contract address'),
        source_code: z.string().describe('Solidity source code'),
        contract_name: z.string().describe('Contract name'),
        compiler_version: z.string().describe('Solidity compiler version'),
        optimization: z.boolean().optional().describe('Whether optimization was enabled'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'get_balance',
    {
      title: 'Get Balance',
      description: 'Get native token balance (e.g., ETH) for an address on a specific chain',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Wallet or contract address'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'get_contract_state',
    {
      title: 'Read Contract State',
      description: 'Call a read-only function on a smart contract',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('View/pure function to call'),
        args: z.array(z.any()).optional().describe('Function arguments'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'simulate_transaction',
    {
      title: 'Simulate Transaction',
      description: 'Simulate a contract call without sending it on-chain. Returns estimated gas and potential errors.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('Function to simulate'),
        args: z.array(z.any()).optional().describe('Function arguments'),
        value: z.string().optional().describe('Native token value (in ETH)'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'get_events',
    {
      title: 'Get Contract Events',
      description: 'Query event logs from a smart contract with optional filters',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        event_name: z.string().describe('Event name to filter'),
        from_block: z.number().optional().describe('Start block number'),
        to_block: z.number().optional().describe('End block number'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'get_transaction',
    {
      title: 'Get Transaction Details',
      description: 'Get transaction details and receipt by transaction hash',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        hash: z.string().describe('Transaction hash'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
```

**Step 5: Implement proxy tools**

```typescript
// packages/core/src/mcp/tools/proxy-tools.ts
import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';

export function registerProxyTools(server: McpServer): void {
  server.registerTool(
    'query_explorer',
    {
      title: 'Query Block Explorer',
      description: 'Query a block explorer API (e.g., Etherscan) for contract ABIs, source code, transaction history, etc.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        module: z.string().describe('API module (e.g., "contract", "account", "transaction")'),
        action: z.string().describe('API action (e.g., "getabi", "getsourcecode", "txlist")'),
        params: z.record(z.string(), z.string()).optional().describe('Additional query parameters'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'query_price',
    {
      title: 'Get Token Price',
      description: 'Get current token price data from CoinGecko or similar price API',
      inputSchema: z.object({
        token_id: z.string().describe('Token identifier (e.g., "ethereum", "bitcoin")'),
        currency: z.string().optional().describe('Target currency (default: "usd")'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
```

**Step 6: Implement ChainVaultServer**

```typescript
// packages/core/src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/server';
import { registerVaultTools } from './tools/vault-tools.js';
import { registerChainTools } from './tools/chain-tools.js';
import { registerProxyTools } from './tools/proxy-tools.js';

interface ServerConfig {
  basePath: string;
}

export class ChainVaultServer {
  private mcpServer: McpServer;
  private registeredTools: string[] = [];

  constructor(config: ServerConfig) {
    this.mcpServer = new McpServer(
      {
        name: 'chainvault-mcp',
        version: '0.1.0',
      },
      {
        capabilities: { logging: {} },
      },
    );

    this.registerAllTools();
  }

  private registerAllTools(): void {
    // We track tool names by wrapping registration
    const originalRegister = this.mcpServer.registerTool.bind(this.mcpServer);
    this.mcpServer.registerTool = ((name: string, ...args: any[]) => {
      this.registeredTools.push(name);
      return (originalRegister as any)(name, ...args);
    }) as any;

    registerVaultTools(this.mcpServer);
    registerChainTools(this.mcpServer);
    registerProxyTools(this.mcpServer);

    // Restore original
    this.mcpServer.registerTool = originalRegister;
  }

  getRegisteredToolNames(): string[] {
    return [...this.registeredTools];
  }

  getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/server.test.ts`
Expected: All tests PASS.

**Step 8: Commit**

```bash
git add packages/core/src/mcp/
git commit -m "feat(mcp): add ChainVaultServer with all tool registrations"
```

---

## Task 12: Core Module Barrel Exports

**Files:**
- Modify: `packages/core/src/index.ts`

Wire all modules into a clean public API.

**Step 1: Update core index**

```typescript
// packages/core/src/index.ts

// Vault
export { MasterVault } from './vault/master-vault.js';
export { AgentVaultManager } from './vault/agent-vault.js';
export {
  encrypt,
  decrypt,
  deriveKeyFromPassword,
  generateRandomKey,
  generateVaultKeyString,
} from './vault/crypto.js';
export type {
  MasterVaultData,
  AgentVaultData,
  AgentConfig,
  TxRules,
  ApiAccessRule,
} from './vault/types.js';

// Rules
export { RulesEngine } from './rules/engine.js';
export type { TxRequest, ApiRequest, RuleResult } from './rules/engine.js';

// Chain
export { EvmAdapter } from './chain/evm-adapter.js';
export type { ChainAdapter } from './chain/types.js';

// Proxy
export { ApiProxy } from './proxy/api-proxy.js';

// Audit
export { AuditLogger } from './audit/logger.js';

// MCP
export { ChainVaultServer } from './mcp/server.js';

export const VERSION = '0.1.0';
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests across all modules PASS.

**Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add barrel exports for all modules"
```

---

## Task 13: CLI Commands (Direct Mode)

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/key.ts`
- Create: `packages/cli/src/commands/agent.ts`
- Create: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/init.test.ts`

Implements the direct CLI commands using `commander`.

**Step 1: Write failing test for init command**

```typescript
// packages/cli/src/commands/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault } from './init.js';

describe('initVault', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-cli-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates vault files in the target directory', async () => {
    await initVault(testDir, 'test-password');
    expect(existsSync(join(testDir, 'master.vault'))).toBe(true);
    expect(existsSync(join(testDir, 'master.salt'))).toBe(true);
  });

  it('returns success message', async () => {
    const result = await initVault(testDir, 'test-password');
    expect(result).toContain('initialized');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/src/commands/init.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement init command**

```typescript
// packages/cli/src/commands/init.ts
import { MasterVault } from '@chainvault/core';

export async function initVault(basePath: string, password: string): Promise<string> {
  await MasterVault.init(basePath, password);
  return `ChainVault initialized at ${basePath}`;
}
```

**Step 4: Implement key commands**

```typescript
// packages/cli/src/commands/key.ts
import { MasterVault } from '@chainvault/core';

export async function addKey(
  basePath: string,
  password: string,
  name: string,
  privateKey: string,
  chains: number[],
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.addKey(name, privateKey, chains);
    return `Key '${name}' added successfully`;
  } finally {
    vault.lock();
  }
}

export async function listKeys(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const keys = vault.listKeys();
    if (keys.length === 0) return 'No keys stored.';
    return keys
      .map((k) => `${k.name}: ${k.address} (chains: ${k.chains.join(', ')})`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function removeKey(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.removeKey(name);
    return `Key '${name}' removed`;
  } finally {
    vault.lock();
  }
}
```

**Step 5: Implement agent commands**

```typescript
// packages/cli/src/commands/agent.ts
import { MasterVault, AgentVaultManager } from '@chainvault/core';
import type { AgentConfig } from '@chainvault/core';

export async function createAgent(
  basePath: string,
  password: string,
  config: AgentConfig,
  grantedKeys: string[],
  grantedApiKeys: string[],
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    const result = await manager.createAgent(config, grantedKeys, grantedApiKeys);
    return `Agent '${config.name}' created.\nVault Key: ${result.vaultKey}\n\nSave this key — it cannot be retrieved later.`;
  } finally {
    vault.lock();
  }
}

export async function listAgents(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    const agents = manager.listAgents();
    if (agents.length === 0) return 'No agents configured.';
    return agents
      .map((a) => `${a.name}: chains=[${a.chains.join(',')}] types=[${a.allowed_types.join(',')}]`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function revokeAgent(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    await manager.revokeAgent(name);
    return `Agent '${name}' revoked and vault deleted`;
  } finally {
    vault.lock();
  }
}
```

**Step 6: Implement serve command**

```typescript
// packages/cli/src/commands/serve.ts
import { ChainVaultServer } from '@chainvault/core';
import { StdioServerTransport } from '@modelcontextprotocol/server';

export async function serve(basePath: string): Promise<void> {
  const server = new ChainVaultServer({ basePath });
  const transport = new StdioServerTransport();
  await server.getMcpServer().connect(transport);
  console.error('ChainVault MCP server running on stdio');
}
```

**Step 7: Wire CLI entry point**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { initVault } from './commands/init.js';
import { addKey, listKeys, removeKey } from './commands/key.js';
import { listAgents, revokeAgent } from './commands/agent.js';
import { serve } from './commands/serve.js';

const DEFAULT_PATH = join(homedir(), '.chainvault');

const program = new Command();

program
  .name('chainvault')
  .description('Secure MCP server gateway between AI agents and blockchains')
  .version('0.1.0');

program
  .command('init')
  .description('Create a new master vault')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    // In real implementation, password is prompted interactively
    const password = process.env.CHAINVAULT_PASSWORD || '';
    if (!password) {
      console.error('Set CHAINVAULT_PASSWORD or use the TUI for interactive setup');
      process.exit(1);
    }
    const result = await initVault(opts.path, password);
    console.log(result);
  });

program
  .command('serve')
  .description('Start the MCP server')
  .option('-p, --path <path>', 'Vault storage path', DEFAULT_PATH)
  .action(async (opts) => {
    await serve(opts.path);
  });

const keyCmd = program.command('key').description('Manage keys');

keyCmd
  .command('list')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = process.env.CHAINVAULT_PASSWORD || '';
    const result = await listKeys(opts.path, password);
    console.log(result);
  });

const agentCmd = program.command('agent').description('Manage agents');

agentCmd
  .command('list')
  .option('-p, --path <path>', 'Vault path', DEFAULT_PATH)
  .action(async (opts) => {
    const password = process.env.CHAINVAULT_PASSWORD || '';
    const result = await listAgents(opts.path, password);
    console.log(result);
  });

program.parse();
```

**Step 8: Run test to verify it passes**

Run: `npx vitest run packages/cli/src/commands/init.test.ts`
Expected: PASS.

**Step 9: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 10: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): add CLI commands for init, key, agent, and serve"
```

---

## Task 14: Integration Test — Full Agent Flow

**Files:**
- Create: `packages/core/src/integration.test.ts`

End-to-end test: create vault → add key → create agent → open agent vault → check rules → simulate chain operation.

**Step 1: Write the integration test**

```typescript
// packages/core/src/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './vault/master-vault.js';
import { AgentVaultManager } from './vault/agent-vault.js';
import { RulesEngine } from './rules/engine.js';
import { AuditLogger } from './audit/logger.js';
import type { AgentConfig } from './vault/types.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_PASSWORD = 'integration-test-password';

describe('Integration: Full Agent Flow', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-integration-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('complete flow: init → add key → create agent → open vault → check rules → audit', async () => {
    // 1. Admin initializes vault
    await MasterVault.init(testDir, TEST_PASSWORD);

    // 2. Admin unlocks and adds a key + API key
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('deployer-key', TEST_PRIVATE_KEY, [11155111]);
    await vault.addApiKey('etherscan', 'TEST_API_KEY', 'https://api-sepolia.etherscan.io');
    await vault.addRpcEndpoint('sepolia', 'https://rpc.sepolia.org', 11155111);

    // 3. Admin creates an agent with limited permissions
    const agentConfig: AgentConfig = {
      name: 'test-agent',
      chains: [11155111],
      tx_rules: {
        allowed_types: ['deploy', 'write', 'read', 'simulate'],
        limits: {
          '11155111': { max_per_tx: '1.0', daily_limit: '5.0', monthly_limit: '30.0' },
        },
      },
      api_access: {
        etherscan: {
          allowed_endpoints: ['getabi', 'getsourcecode'],
          rate_limit: { per_second: 5, daily: 1000 },
        },
      },
      contract_rules: { mode: 'none' },
    };

    const manager = new AgentVaultManager(testDir, vault);
    const { vaultKey } = await manager.createAgent(agentConfig, ['deployer-key'], ['etherscan']);
    vault.lock();

    // 4. Agent opens its vault (no master vault needed)
    const agentData = await manager.openAgentVault('test-agent', vaultKey);
    expect(agentData.agent_name).toBe('test-agent');
    expect(Object.keys(agentData.keys)).toEqual(['deployer-key']);
    expect(Object.keys(agentData.api_keys)).toEqual(['etherscan']);
    expect(Object.keys(agentData.rpc_endpoints)).toEqual(['sepolia']);

    // 5. Rules engine checks requests
    const rules = new RulesEngine(agentData.config);

    // Approved: deploy on Sepolia
    const deployResult = rules.checkTxRequest({ type: 'deploy', chain_id: 11155111, value: '0.5' });
    expect(deployResult.approved).toBe(true);

    // Denied: deploy on mainnet (not in chains)
    const mainnetResult = rules.checkTxRequest({ type: 'deploy', chain_id: 1, value: '0' });
    expect(mainnetResult.approved).toBe(false);

    // Denied: exceed per-tx limit
    const overLimitResult = rules.checkTxRequest({ type: 'write', chain_id: 11155111, value: '1.5' });
    expect(overLimitResult.approved).toBe(false);

    // Approved: API request
    const apiResult = rules.checkApiRequest({ service: 'etherscan', endpoint: 'getabi' });
    expect(apiResult.approved).toBe(true);

    // Denied: wrong API endpoint
    const apiDenied = rules.checkApiRequest({ service: 'etherscan', endpoint: 'sendrawtransaction' });
    expect(apiDenied.approved).toBe(false);

    // 6. Audit logger records everything
    const logger = new AuditLogger(testDir);
    await logger.log({ agent: 'test-agent', action: 'deploy_contract', chain_id: 11155111, status: 'approved', details: 'test deploy' });
    await logger.log({ agent: 'test-agent', action: 'deploy_contract', chain_id: 1, status: 'denied', details: 'chain not allowed' });

    const allEntries = await logger.getEntries();
    expect(allEntries).toHaveLength(2);

    const deniedEntries = await logger.getEntries({ status: 'denied' });
    expect(deniedEntries).toHaveLength(1);
  });

  it('agent vault key rotation invalidates old key', async () => {
    await MasterVault.init(testDir, TEST_PASSWORD);
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('key1', TEST_PRIVATE_KEY, [1]);

    const config: AgentConfig = {
      name: 'rotate-test',
      chains: [1],
      tx_rules: { allowed_types: ['read'], limits: {} },
      api_access: {},
      contract_rules: { mode: 'none' },
    };

    const manager = new AgentVaultManager(testDir, vault);
    const { vaultKey: oldKey } = await manager.createAgent(config, ['key1'], []);
    const { vaultKey: newKey } = await manager.rotateAgentKey('rotate-test', oldKey);

    // New key works
    const data = await manager.openAgentVault('rotate-test', newKey);
    expect(data.agent_name).toBe('rotate-test');

    // Old key fails
    await expect(manager.openAgentVault('rotate-test', oldKey)).rejects.toThrow();

    vault.lock();
  });
});
```

**Step 2: Run integration test**

Run: `npx vitest run packages/core/src/integration.test.ts`
Expected: All tests PASS.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests PASS.

**Step 4: Commit**

```bash
git add packages/core/src/integration.test.ts
git commit -m "test: add full integration test for agent flow and key rotation"
```

---

## Task 15: README & Documentation

**Files:**
- Create: `README.md`
- Create: `LICENSE`

Write a compelling README for GitHub stars.

**Step 1: Write README.md**

The README should include:
- Tagline and badges
- Architecture diagram (text-based)
- "Why ChainVault?" section highlighting the security model
- Quick start (install, init, add key, create agent, configure MCP)
- Tool reference table
- Security model summary with threat table
- Contributing section
- License

Key sections to emphasize for stars:
- The zero-knowledge agent concept
- The vault architecture diagram
- Before/after comparison (raw key in env var vs ChainVault)

**Step 2: Add MIT LICENSE file**

**Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README with security model, architecture, and quick start"
```

---

## Task Summary

| Task | Module | Tests | Description |
|------|--------|-------|-------------|
| 1 | Setup | 0 | Project scaffolding, monorepo, deps |
| 1B | Docs | 0 | CLAUDE.md hierarchy + path-scoped rules |
| 2 | Vault | 10 | AES-256-GCM encryption + HKDF |
| 3 | Vault | 8 | Zod-validated data structures |
| 4 | Vault | 9 | Master vault CRUD operations |
| 5 | Vault | 8 | Agent vault create/open/rotate/revoke |
| 6 | Audit | 6 | Append-only audit logger |
| 7 | Rules | 11 | Rule engine enforcement |
| 8 | Chain | 6 | EVM adapter read operations |
| 9 | Chain | 2 | EVM adapter write operations |
| 10 | Proxy | 5 | API proxy with caching + rate limiting |
| 11 | MCP | 2 | Server + tool registration |
| 12 | Core | 0 | Barrel exports |
| 13 | CLI | 1 | CLI commands |
| 14 | Integration | 2 | End-to-end flow test |
| 15 | Docs | 0 | README + LICENSE |

**Total: ~70 tests across 16 tasks**

---

## Execution Notes

- **Task 1B is mandatory before any code tasks.** CLAUDE.md files set the rules for everything after.
- Tasks 1-7 are the critical path — vault + rules must be solid before chain/proxy
- Tasks 8-10 can be parallelized (chain and proxy are independent)
- Task 11 depends on all prior modules
- Task 14 is the validation gate — if integration tests pass, core is ready
- Task 15 should be done with care — README quality directly impacts star count

## Living Documentation Protocol

CLAUDE.md files and README.md are **living documents**. They must be updated as part of the development process, not as an afterthought.

### When to Update CLAUDE.md

- **New module added** → Update root CLAUDE.md architecture section if needed
- **New convention established** → Add to relevant CLAUDE.md (root or package-level)
- **New command added** → Update root CLAUDE.md quick reference
- **Security pattern changed** → Update `.claude/rules/security.md` IMMEDIATELY
- **Testing pattern changed** → Update `.claude/rules/testing.md`

### When to Update README.md

- **New MCP tool added** → Update tool reference table
- **New CLI command added** → Update CLI reference section
- **Installation process changed** → Update quick start
- **Security model changed** → Update security section

### Git History as Development Context

Before starting work each session:

1. `git log --oneline -20` — understand recent trajectory
2. `git log --oneline --all --graph` — check for branches
3. `git diff HEAD~1` — review the last change in detail if relevant
4. `git blame <file>` — when modifying existing code, understand why it was written that way

This prevents duplicate work, maintains consistent style with recent commits, and respects decisions already made.

---

## Future Tasks — V2 Roadmap

These items were discussed during design but deliberately deferred from V1. They are documented here so context is preserved across sessions.

### V1.1 — Immediate Follow-ups

| Task | Description | Why Deferred |
|------|-------------|--------------|
| **TUI Screens** | Full Ink TUI: Dashboard, Keys, Agents, Services, Logs, Rules screens as designed in Section 6 of design doc. Task 13 only implements CLI commands. | Scope — CLI commands ship first, TUI is the polish layer |
| **WebAuthn/Passkey** | Replace password-based master vault unlock with WebAuthn/Passkey via `@simplewebauthn/server`. Design says "preferred", V1 uses password fallback only. | Complexity — passkey in CLI requires a local HTTP callback flow |
| **Spend Tracking Persistence** | Rules engine tracks daily/monthly spending in-memory. Needs to persist to disk and survive MCP server restarts. | V1 is functional without it, but production use requires it |
| **Contract Compilation** | Compile Solidity source via solc before deployment. Currently `deploy_contract` expects pre-compiled bytecode. | Keeps V1 scope focused — agents can compile externally |

### V2 — Analysis Tools (Docker Layer)

This was the core "B → C" progression discussed during brainstorming.

| Task | Description | Notes |
|------|-------------|-------|
| **Slither Integration** | Python-based static analysis in Docker container. New `packages/analysis/` package. | TypeScript MCP server + Python worker architecture (Option C from our discussion) |
| **Aderyn Integration** | Cyfrin's Rust-based analyzer in Docker. Second opinion alongside Slither. | Ships as a separate Docker image |
| **Smart Tool Orchestration** | MCP picks the right analysis tools based on what the agent asks for, not "run everything". | Key differentiator discussed — agent says "quick check" vs "deep audit" and gets different tool combinations |
| **Time Estimates for Tools** | Each analysis tool reports estimated runtime before execution so the agent can make informed decisions. | Discussed as important UX — agent shouldn't blindly wait 10 minutes |
| **Fuzzing (Echidna/Medusa)** | Property-based testing / fuzzing for smart contracts. The "eventually target C" goal. | Most complex analysis integration — requires test harness generation |
| **Gas Optimization Analysis** | Analyze contracts for gas inefficiencies and suggest optimizations. | Can be built on top of Slither's detectors |

### V2 — Platform Expansion

| Task | Description | Notes |
|------|-------------|-------|
| **Web Admin Panel** | `packages/web/` — browser-based admin UI for vault management. Served by the MCP process. | Discussed as future addition, TUI is V1 admin interface |
| **Non-EVM Chain Adapters** | Solana, Move (Aptos/Sui), Bitcoin. Architecture is already chain-agnostic — each is a new adapter implementing `ChainAdapter` interface. | Design decision: "EVM-first but chain-agnostic architecture so adding Solana/Move/etc. later is just a new adapter" |

### Key Design Decisions to Carry Forward

These decisions were made during brainstorming and must be respected in future work:

1. **Agent vault architecture** — The agent never touches real keys. It holds a vault key (AES key to its own vault), not a private key. This is the core security differentiator. Do not compromise this.

2. **Double defense** — Rules engine rejects + key not in vault. Both layers must exist. Don't rely on only one.

3. **API keys get vault treatment** — Same encryption, same access control, same proxy layer as private keys. Not env vars.

4. **The proxy is an agent firewall** — Rate limiting, endpoint whitelisting, and cost tracking. Not just a convenience wrapper.

5. **Modular monolith → microservices path** — Current architecture is a single process with clean module boundaries. If scale demands it, vault/chain/proxy can be split into separate services. Don't break module boundaries.

6. **Docker for tools, npm for MCP** — `npm install` gets the MCP server running. Docker is only needed for analysis tools (Slither/Aderyn). Don't make Docker a requirement for V1.

7. **Security-first positioning** — The README tagline: "Your agent gets blockchain superpowers without ever touching a private key." Every feature decision should reinforce this positioning. This is what gets stars.
