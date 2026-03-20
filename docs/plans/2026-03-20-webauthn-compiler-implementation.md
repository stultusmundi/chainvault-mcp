# WebAuthn/Passkey + Contract Compilation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add WebAuthn/Passkey authentication as an alternative vault unlock method, and Solidity contract compilation via Docker or local solc.

**Architecture:** WebAuthn uses a temporary localhost HTTP server + browser popup for the passkey ceremony. The vault supports dual-key encryption (password + passkey can both unlock). Contract compilation shells out to `docker run ethereum/solc:<version>` (preferred) or local `solc` (fallback with version check), using solc's standard-json interface.

**Tech Stack:** `@simplewebauthn/server`, Node.js `http` module, `execFile` for safe subprocess calls, `vitest` for testing.

**Design Doc:** `docs/plans/2026-03-20-webauthn-compiler-design.md`

---

## Development Process Rules

Same rules as V1. Read `CLAUDE.md`. Check `git log` and `git status`. Run `npx vitest run` and `npx tsc --noEmit` after each task. Commit frequently. IMPORTANT: Always use `execFile` (from `node:child_process`) for subprocess calls — never use `exec` — to prevent shell injection.

---

## Task 1: Solidity Compiler — Core Module

**Files:**
- Create: `packages/core/src/compiler/solidity.ts`
- Create: `packages/core/src/compiler/solidity.test.ts`

**Step 1: Write failing tests**

The test file should mock `execFile` from `node:child_process` via `vi.mock`. Tests cover:
- `buildStandardInput()` — generates valid solc standard-json input with source, optimizer settings
- `parseOutput()` — extracts abi + bytecode from solc output, throws on compilation errors, throws if contract not found
- `resolveCompiler()` — prefers docker when available, falls back to local solc with matching version, errors on version mismatch, errors when no compiler found

Use `vi.mocked(execFile)` to control subprocess responses in tests.

**Step 2: Run tests — verify fail**

Run: `npx vitest run packages/core/src/compiler/solidity.test.ts`

**Step 3: Implement SolidityCompiler**

The class has these methods:
- `buildStandardInput(source, optimization, optimizationRuns)` — returns JSON string for solc --standard-json
- `parseOutput(rawOutput, contractName)` — parses solc JSON output, returns `{ abi, bytecode, warnings }`
- `resolveCompiler(version)` — checks docker availability, then local solc version match, returns `{ type: 'docker' | 'local', version }`
- `compile(source, version, contractName, optimization?, optimizationRuns?)` — full flow: resolve compiler, build input, run subprocess, parse output

Uses `promisify(execFileCb)` from `node:child_process` for safe subprocess calls. Docker command: `['docker', 'run', '--rm', '-i', 'ethereum/solc:<version>', '--standard-json']` with `{ input }` option for stdin. Local command: `['solc', '--standard-json']` with `{ input }`.

**Step 4: Run tests — verify pass**

**Step 5: Commit**

```bash
git add packages/core/src/compiler/
git commit -m "feat(compiler): add SolidityCompiler with Docker/local solc support"
```

---

## Task 2: Compiler MCP Tool Registration

**Files:**
- Create: `packages/core/src/mcp/tools/compiler-tools.ts`
- Modify: `packages/core/src/mcp/server.ts`
- Modify: `packages/core/src/mcp/server.test.ts`

**Step 1:** Add `expect(toolNames).toContain('compile_contract');` to existing server test.

**Step 2:** Run test — verify fail.

**Step 3:** Create `compiler-tools.ts` with `registerCompilerTools(server)` function. Register `compile_contract` tool with zod schema: `source_code: z.string()`, `compiler_version: z.string()`, `contract_name: z.string()`, `optimization: z.boolean().optional()`, `optimization_runs: z.number().optional()`. Placeholder handler for now.

**Step 4:** Import and call `registerCompilerTools` in `server.ts` `registerAllTools()` method.

**Step 5:** Run test — verify pass.

**Step 6:** Commit.

```bash
git add packages/core/src/mcp/tools/compiler-tools.ts packages/core/src/mcp/server.ts packages/core/src/mcp/server.test.ts
git commit -m "feat(mcp): register compile_contract tool"
```

---

## Task 3: Update Core Barrel Exports for Compiler

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1:** Add exports:
```typescript
// Compiler
export { SolidityCompiler } from './compiler/solidity.js';
export type { CompileResult } from './compiler/solidity.js';
```

**Step 2:** Verify: `npx tsc --noEmit && npx vitest run`

**Step 3:** Commit.

---

## Task 4: WebAuthn — Vault Dual-Key Encryption

**Files:**
- Create: `packages/core/src/vault/dual-key.ts`
- Create: `packages/core/src/vault/dual-key.test.ts`

This is the core cryptographic change: instead of encrypting the vault directly with the password-derived key, we generate a random master key, encrypt the vault with it, then store the master key encrypted with the password-derived key. Later, the passkey can add a second encrypted copy of the master key.

**Step 1: Write failing tests**

Tests cover:
- `initWithPassword` + `unlockWithPassword` round-trip (returns 32-byte Buffer)
- Fails with wrong password
- `addPasskey` + `unlockWithPasskey` returns same master key as password path
- Password still works after passkey added
- `hasPasskey()` returns false initially, true after registration

**Step 2: Run tests — verify fail**

**Step 3: Implement DualKeyManager**

Class at `packages/core/src/vault/dual-key.ts`:
- `initWithPassword(password)` — generates random master key, derives password key via HKDF, encrypts master key with password key, stores encrypted master key + salt
- `unlockWithPassword(password)` — reads salt, derives password key, decrypts master key
- `addPasskey(credentialId, masterKey)` — derives passkey key from credentialId via HKDF, encrypts master key, stores in passkey.json
- `unlockWithPasskey(credentialId)` — reads passkey.json, derives passkey key, decrypts master key
- `hasPasskey()` — checks if passkey.json exists

Uses existing `deriveKeyFromPassword`, `encrypt`, `decrypt`, `generateRandomKey` from `./crypto.js`.

**Step 4: Run tests — verify pass**

**Step 5: Commit**

```bash
git add packages/core/src/vault/dual-key.ts packages/core/src/vault/dual-key.test.ts
git commit -m "feat(vault): add DualKeyManager for password + passkey dual encryption"
```

---

## Task 5: WebAuthn Server — Registration & Authentication Options

**Files:**
- Modify: `packages/core/package.json` (add @simplewebauthn/server)
- Create: `packages/core/src/auth/webauthn-server.ts`
- Create: `packages/core/src/auth/webauthn-server.test.ts`

**Step 1:** Run: `npm install -w packages/core @simplewebauthn/server`

**Step 2: Write failing tests**

Tests cover:
- `generateRegistrationOptions()` returns correct rp.name, rp.id (localhost), and a challenge
- `generateAuthenticationOptions(credentialId)` returns challenge and rpId
- `getCurrentChallenge()` returns the last generated challenge

**Step 3: Run tests — verify fail**

**Step 4: Implement WebAuthnManager**

Class with methods for generating WebAuthn ceremony options. Uses `randomBytes` for challenges. Stores current challenge for verification.

**Step 5: Run tests — verify pass**

**Step 6: Commit**

```bash
git add packages/core/package.json package-lock.json packages/core/src/auth/
git commit -m "feat(auth): add WebAuthnManager for passkey registration and authentication"
```

---

## Task 6: WebAuthn Local HTTP Server

**Files:**
- Create: `packages/core/src/auth/local-server.ts`
- Create: `packages/core/src/auth/local-server.test.ts`
- Create: `packages/core/src/auth/pages.ts`

**Step 1: Write failing tests**

Tests cover:
- Server starts on a random port (port > 0, < 65536)
- `getUrl('register')` returns correct URL
- Server stops cleanly

**Step 2: Run tests — verify fail**

**Step 3: Create HTML pages** (`pages.ts`)

Two functions: `registrationPage(options)` and `authenticationPage(options)`. Return HTML strings with inline JavaScript that calls `navigator.credentials.create/get()`, sends the response to `/callback` via fetch POST.

**Step 4: Implement AuthLocalServer**

Node.js HTTP server binding to `127.0.0.1` only. Routes:
- GET `/register` or `/auth` — serves the HTML page
- POST `/callback` — receives WebAuthn credential response, resolves the `waitForCallback()` promise

Methods:
- `start()` — starts server on random port, returns port number
- `getUrl(path)` — returns full URL
- `setRegistrationPage(options)` / `setAuthenticationPage(options)` — sets page content
- `waitForCallback(timeoutMs)` — returns promise that resolves with credential data
- `stop()` — shuts down server

**Step 5: Run tests — verify pass**

**Step 6: Commit**

```bash
git add packages/core/src/auth/
git commit -m "feat(auth): add local HTTP server and browser pages for WebAuthn ceremony"
```

---

## Task 7: WebAuthn TUI Integration

**Files:**
- Modify: `packages/cli/src/tui/components/PasswordPrompt.tsx`
- Modify: `packages/cli/src/tui/App.tsx`

**Step 1: Update PasswordPrompt**

Add `hasPasskey: boolean` and `onPasskeyRequest: () => void` props. When `hasPasskey` is true, show a mode selection first: `[P]asskey or [T]ype password`. Press `p` triggers `onPasskeyRequest`. Press `t` shows the regular masked password input. When `hasPasskey` is false, show password input directly (same as today).

**Step 2: Update App.tsx**

- On launch, check if passkey.json exists in basePath using `DualKeyManager.hasPasskey()`
- Pass `hasPasskey` and `onPasskeyRequest` to PasswordPrompt
- Passkey flow: create AuthLocalServer + WebAuthnManager, generate auth options, set page, start server, open browser (using `execFile` with `open` on macOS / `xdg-open` on Linux), wait for callback, use credentialId with DualKeyManager.unlockWithPasskey(), stop server
- Add "Register Passkey" option to Dashboard (press `r`): similar flow but with registration options and DualKeyManager.addPasskey()

**Step 3: Verify build**

Run: `npx tsc --noEmit && npx vitest run`

**Step 4: Commit**

```bash
git add packages/cli/src/tui/
git commit -m "feat(tui): integrate WebAuthn passkey auth with dual prompt and registration"
```

---

## Task 8: Final Exports and Verification

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add exports**

```typescript
// Auth
export { WebAuthnManager } from './auth/webauthn-server.js';
export { AuthLocalServer } from './auth/local-server.js';
export { DualKeyManager } from './vault/dual-key.js';
```

**Step 2: Full verification**

- `npx vitest run` — all tests pass
- `npx tsc --noEmit` — no errors
- `npm run build` — clean build

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export auth, compiler, and dual-key modules"
```

---

## Task Summary

| Task | Module | Description |
|------|--------|-------------|
| 1 | Compiler | SolidityCompiler with Docker/local solc |
| 2 | MCP | Register compile_contract tool |
| 3 | Core | Barrel exports for compiler |
| 4 | Vault | DualKeyManager for dual encryption |
| 5 | Auth | WebAuthnManager for passkey options |
| 6 | Auth | Local HTTP server + browser pages |
| 7 | TUI | Dual prompt + passkey registration |
| 8 | Core | Final exports and verification |

## Execution Notes

- Tasks 1-3 are the compiler feature (independent)
- Tasks 4-7 are WebAuthn (sequential)
- Task 8 is the validation gate
- Task 4 is the most cryptographically sensitive
- Existing vaults keep working — DualKeyManager is for new vaults or passkey registration
