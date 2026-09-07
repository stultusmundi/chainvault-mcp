# Per-Request Vault Decryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop holding decrypted agent secrets in memory for the life of the MCP
server; re-read and re-decrypt the vault file for each secret access, so
rotation and revocation take effect immediately.

**Architecture:** `AgentContext` keeps only the 32-byte vault key buffer. The
four accessors that return secrets become `async` and call a private
`openVault()` that reads, decrypts, and parses the vault file per call.
Non-secret values (`agentName`, `config`, `rules`, `keys`) stay snapshotted at
init, which is safe because every vault mutation path mints a new key. The
vault key is also removed from `process.env` once the context exists.

**Tech Stack:** TypeScript (ES modules, strict), `vitest`, Node `node:crypto`
and `node:fs/promises`.

**Spec:** `docs/superpowers/specs/2026-09-07-per-request-vault-decryption-design.md`

## Global Constraints

- ES modules only — `import`/`export`, and every relative import ends in `.js`.
- Zod validates all vault data; parse through `AgentVaultDataSchema`.
- Strict TypeScript. No `any` outside viem ABI types.
- Private keys and API keys are NEVER logged, returned to agents, or placed in
  an error message. `VaultUnavailableError` must name only the agent, never a path
  containing a secret and never key material.
- Type check with `npm run lint` (`tsc -p tsconfig.check.json --noEmit` plus the
  tests project). Plain `tsc --noEmit` is vacuous in this repo.
- Unit gate: `npx vitest run --project unit`. Anvil gate: `npm run test:workstyle`
  (needs Foundry on `PATH`; on this machine `export PATH="$HOME/.foundry/bin:$PATH"`).
- Commit messages: imperative, under 72 chars, scoped — e.g. `feat(mcp): ...`.

---

### Task 1: Make the secret accessors async

Pure interface churn, no behaviour change: the accessors still read the
snapshot decrypted at init. Separating this from Task 2 keeps the large
mechanical diff away from the small risky one, so each can be judged on its own.

**Files:**
- Modify: `packages/core/src/mcp/context.ts:21-30` (interface), `:86-122` (accessors)
- Modify: `packages/core/src/mcp/tools/chain-tools.ts` lines 82, 127, 180, 187, 247, 318, 352, 398, 448, 484
- Modify: `packages/core/src/mcp/tools/proxy-tools.ts:43`
- Test: `packages/core/src/mcp/context.test.ts`
- Test: `packages/core/src/mcp/tools/chain-tools.test.ts`
- Test: `packages/core/src/mcp/tools/proxy-tools.test.ts`
- Test: `packages/core/src/mcp/tools/chain-registry-tools.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AgentContext` with
  `getPrivateKeyForChain(chainId: number): Promise<string | null>`,
  `getApiKey(serviceName: string): Promise<{ key: string; baseUrl: string } | null>`,
  `getApiKeyForExplorer(explorerApiUrl: string): Promise<{ serviceName: string; key: string } | null>`,
  `getRpcUrlForChain(chainId: number): Promise<string | null>`.
  `agentName`, `config`, `rules`, `keys` are unchanged and stay synchronous.

- [ ] **Step 1: Update the interface**

In `packages/core/src/mcp/context.ts`, replace the four accessor signatures in
`export interface AgentContext`:

```typescript
export interface AgentContext {
  agentName: string;
  config: AgentConfig;
  rules: RulesEngine;
  keys: AgentKeyInfo[];  // public addresses only
  // Secret accessors. Async because Task 2 makes them re-read the vault file
  // per call; an RPC URL counts as a secret because Infura/Alchemy URLs carry
  // the API key in the path.
  getPrivateKeyForChain(chainId: number): Promise<string | null>;
  getApiKey(serviceName: string): Promise<{ key: string; baseUrl: string } | null>;
  getApiKeyForExplorer(explorerApiUrl: string): Promise<{ serviceName: string; key: string } | null>;
  getRpcUrlForChain(chainId: number): Promise<string | null>;
}
```

- [ ] **Step 2: Mark the four implementations async**

Still in `context.ts`, add `async` to each of the four closures. Nothing else
changes — they keep reading `vaultData`:

```typescript
      const getPrivateKeyForChain = async (chainId: number): Promise<string | null> => {
        for (const [, key] of Object.entries(vaultData.keys)) {
          if (key.chains.includes(chainId)) return key.private_key;
        }
        return null;
      };

      const getApiKey = async (serviceName: string): Promise<{ key: string; baseUrl: string } | null> => {
        const entry = vaultData.api_keys[serviceName];
        return entry ? { key: entry.key, baseUrl: entry.base_url } : null;
      };
```

Do the same for `getApiKeyForExplorer` and `getRpcUrlForChain`, keeping their
bodies exactly as they are.

- [ ] **Step 3: Run the type check to find every call site**

Run: `npm run lint`
Expected: FAIL, with errors at the `chain-tools.ts` and `proxy-tools.ts` lines
listed above — mostly `Type 'Promise<string | null>' is not assignable to type 'string'`.
Use this list as the worklist for the next step.

- [ ] **Step 4: Await every call site**

In `packages/core/src/mcp/tools/chain-tools.ts`, each adapter construction
becomes:

```typescript
        const adapter = EvmAdapter.fromChainId(chain_id, (await ctx!.getRpcUrlForChain(chain_id)) ?? undefined);
```

Sites using `ctx?.` keep the optional chain — `await` handles `undefined` fine:

```typescript
        const adapter = EvmAdapter.fromChainId(chain_id, (await ctx?.getRpcUrlForChain(chain_id)) ?? undefined);
```

Key and explorer lookups become:

```typescript
      const privateKey = await ctx!.getPrivateKeyForChain(chain_id);
```

```typescript
      const apiKeyMatch = await ctx!.getApiKeyForExplorer(explorerApiUrl);
```

In `packages/core/src/mcp/tools/proxy-tools.ts:43`:

```typescript
      const apiKeyMatch = await ctx.getApiKeyForExplorer(explorerApiUrl);
```

Every enclosing handler is already `async`, so no signature changes are needed.

- [ ] **Step 5: Update the four test doubles**

In `packages/core/src/mcp/tools/chain-tools.test.ts`, `proxy-tools.test.ts`, and
`chain-registry-tools.test.ts`, the context doubles return values directly.
Make each of the four accessors async, for example in `chain-tools.test.ts`:

```typescript
    getPrivateKeyForChain: async () => '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    getApiKey: async () => null,
    getApiKeyForExplorer: async () => null,
    getRpcUrlForChain: async () => null,
```

and in the `verify_contract` and `query_explorer` doubles that supply a key:

```typescript
      getApiKeyForExplorer: async () => ({ serviceName: 'etherscan', key: 'SECRET_KEY' }),
```

In `packages/core/src/mcp/context.test.ts`, add `await` to the accessor calls at
lines 63, 80, 93, 114, 120, 126, 133, 139, 140. For example:

```typescript
    const match = await ctx!.getApiKeyForExplorer('https://api.etherscan.io/v2/api');
```

```typescript
    expect(await ctx!.getRpcUrlForChain(31337)).toBe('http://127.0.0.1:8545');
    expect(await ctx!.getRpcUrlForChain(1)).toBeNull();
```

- [ ] **Step 6: Update the workstyle fixture assertions**

In `tests/workstyle/vault-fixture.test.ts` lines 13, 14, and 31:

```typescript
      expect(await ctx!.getRpcUrlForChain(ANVIL_CHAIN_ID)).toBe('http://127.0.0.1:65001');
      expect(await ctx!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBe(ANVIL_ACCOUNTS[0].privateKey);
```

```typescript
      expect(await reader!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBeNull();
```

Without the `await`, `expect(Promise).toBeNull()` fails and
`expect(Promise).toBe(key)` fails — these are real assertions, not formality.

- [ ] **Step 7: Verify the whole suite is green**

Run: `npm run lint && npx vitest run --project unit`
Expected: type check clean, all unit tests pass.

Run: `export PATH="$HOME/.foundry/bin:$PATH" && npm run test:workstyle`
Expected: 54 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/mcp tests/workstyle/vault-fixture.test.ts
git commit -m "refactor(mcp): make vault secret accessors async"
```

---

### Task 2: Decrypt per request

The behaviour change. Small diff, all of the risk.

**Files:**
- Modify: `packages/core/src/mcp/context.ts`
- Modify: `packages/core/src/index.ts:64-65` (export the new error)
- Test: `packages/core/src/mcp/context.test.ts`

**Interfaces:**
- Consumes: the async accessor signatures from Task 1.
- Produces: `export class VaultUnavailableError extends Error`, and
  `AgentContext.dispose(): void` which zeroes the retained key buffer.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/mcp/context.test.ts`, inside the existing
`describe('createAgentContext', ...)` block:

```typescript
  it('re-reads the vault file on every secret access', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    const vaultPath = join(testDir, 'agents', 'deployer.vault');
    const before = await readFile(vaultPath, 'utf8');

    // Corrupting the file after init must break the next access — proof the
    // secret came from disk and not from a snapshot taken at startup.
    await writeFile(vaultPath, 'not-a-vault', 'utf8');
    await expect(ctx!.getPrivateKeyForChain(11155111)).rejects.toThrow(VaultUnavailableError);

    await writeFile(vaultPath, before, 'utf8');
    expect(await ctx!.getPrivateKeyForChain(11155111)).toBe(TEST_PRIVATE_KEY);
  });

  it('fails closed once the agent key is rotated', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    expect(await ctx!.getPrivateKeyForChain(11155111)).toBe(TEST_PRIVATE_KEY);

    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    const manager = new AgentVaultManager(testDir, vault);
    await manager.rotateAgentKey('deployer', vaultKey);
    vault.lock();

    await expect(ctx!.getPrivateKeyForChain(11155111)).rejects.toThrow(VaultUnavailableError);
  });

  it('fails closed once the agent is revoked', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    await rm(join(testDir, 'agents', 'deployer.vault'), { force: true });

    await expect(ctx!.getApiKey('etherscan')).rejects.toThrow(VaultUnavailableError);
  });

  it('keeps serving non-secret values from the init snapshot', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    await rm(join(testDir, 'agents', 'deployer.vault'), { force: true });

    // Public metadata needs no vault read, so it must not start throwing.
    expect(ctx!.agentName).toBe('deployer');
    expect(ctx!.config.chains).toEqual([11155111, 31337]);
    expect(ctx!.keys[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('lists API services without exposing any key', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    const services = await ctx!.listApiServices();

    expect(services).toEqual([{ name: 'etherscan', baseUrl: 'https://api.etherscan.io' }]);
    expect(JSON.stringify(services)).not.toContain('TEST_API_KEY');
  });

  it('fails closed after dispose', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    ctx!.dispose();

    await expect(ctx!.getPrivateKeyForChain(11155111)).rejects.toThrow(VaultUnavailableError);
  });
```

Extend the imports at the top of the file:

```typescript
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { createAgentContext, VaultUnavailableError } from './context.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/context.test.ts --project unit`
Expected: FAIL — `VaultUnavailableError` is not exported, and
`ctx.listApiServices` / `ctx.dispose` are not functions.

- [ ] **Step 3: Add the error type and the two new members**

At the top of `packages/core/src/mcp/context.ts`, after the imports:

```typescript
/**
 * Thrown when the agent vault can no longer be opened — rotated, regenerated,
 * revoked, or the context was disposed. Names the agent only: no path, no key
 * material, nothing that could leak a secret into a log or a tool response.
 */
export class VaultUnavailableError extends Error {
  constructor(agentName: string) {
    super(
      `Agent vault for '${agentName}' can no longer be opened. ` +
        'It may have been rotated, regenerated, or revoked — reconnect with a current vault key.',
    );
    this.name = 'VaultUnavailableError';
  }
}
```

Add to the `AgentContext` interface:

```typescript
  /** Configured API services. Base URLs are not secrets. */
  listApiServices(): Promise<Array<{ name: string; baseUrl: string }>>;
  /** Zeroes the retained vault key. Every later secret access fails closed. */
  dispose(): void;
```

- [ ] **Step 4: Replace the snapshot with a per-call read**

Inside the `for (const filename of vaultFiles)` loop in `context.ts`, after
`vaultData` has been parsed, capture the path and define the loader. Keep the
existing initial decrypt: it is what identifies the right file and provides the
non-secret snapshot.

```typescript
      const vaultPath = join(agentsDir, filename);
      const agentName = vaultData.agent_name;
      let disposed = false;

      /**
       * Reads and decrypts the vault for a single access. Only the key buffer
       * lives between calls, so a rotation or revocation takes effect on the
       * very next tool call instead of at the next reconnect.
       */
      const openVault = async (): Promise<AgentVaultData> => {
        if (disposed) throw new VaultUnavailableError(agentName);
        try {
          const current = await readFile(vaultPath, 'utf8');
          return AgentVaultDataSchema.parse(JSON.parse(decrypt(current, keyBuffer)));
        } catch {
          // Deliberately swallow the cause: it can carry a path or crypto detail
          // that has no business reaching an agent.
          throw new VaultUnavailableError(agentName);
        }
      };
```

Rewrite the four accessors to read from `openVault()`:

```typescript
      const getPrivateKeyForChain = async (chainId: number): Promise<string | null> => {
        const data = await openVault();
        for (const [, key] of Object.entries(data.keys)) {
          if (key.chains.includes(chainId)) return key.private_key;
        }
        return null;
      };

      const getApiKey = async (serviceName: string): Promise<{ key: string; baseUrl: string } | null> => {
        const data = await openVault();
        const entry = data.api_keys[serviceName];
        return entry ? { key: entry.key, baseUrl: entry.base_url } : null;
      };

      const getApiKeyForExplorer = async (
        explorerApiUrl: string,
      ): Promise<{ serviceName: string; key: string } | null> => {
        const data = await openVault();
        for (const [name, ak] of Object.entries(data.api_keys)) {
          try {
            const akHost = new URL(ak.base_url).hostname;
            const explorerHost = new URL(explorerApiUrl).hostname;
            const akDomain = akHost.split('.').slice(-2).join('.');
            const explorerDomain = explorerHost.split('.').slice(-2).join('.');
            // Registrable-domain equality only. Substring matching is unsafe now
            // that every explorer URL resolves to api.etherscan.io: a key stored
            // under `foo.etherscan.io.evil.com` or `scan.io` would otherwise
            // match and have its secret sent to Etherscan.
            if (akDomain === explorerDomain) {
              return { serviceName: name, key: ak.key };
            }
          } catch { continue; }
        }
        return null;
      };

      const getRpcUrlForChain = async (chainId: number): Promise<string | null> => {
        const data = await openVault();
        for (const ep of Object.values(data.rpc_endpoints)) {
          if (ep.chain_id === chainId) return ep.url;
        }
        return null;
      };

      const listApiServices = async (): Promise<Array<{ name: string; baseUrl: string }>> => {
        const data = await openVault();
        return Object.entries(data.api_keys).map(([name, ak]) => ({ name, baseUrl: ak.base_url }));
      };

      const dispose = (): void => {
        disposed = true;
        wipeBuffer(keyBuffer);
      };
```

Add `listApiServices` and `dispose` to the returned object, and extend the crypto
import at the top of the file:

```typescript
import { decrypt, wipeBuffer } from '../vault/crypto.js';
```

Also import the vault data type:

```typescript
import { AgentVaultDataSchema, type AgentConfig, type AgentVaultData } from '../vault/types.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/context.test.ts --project unit`
Expected: PASS, including the six new cases.

- [ ] **Step 6: Export the error from the package**

In `packages/core/src/index.ts`, extend line 64:

```typescript
export { createAgentContext, VaultUnavailableError } from './mcp/context.js';
```

- [ ] **Step 7: Make tool handlers report the failure instead of crashing**

`sanitizeError` already strips secrets, and every tool handler already wraps its
work in `try`/`catch`, so a `VaultUnavailableError` raised inside the `try`
returns as an error string. Two sites fetch a secret *before* their `try`, and
must be moved inside it or wrapped.

In `packages/core/src/mcp/tools/chain-tools.ts`, the `deploy_contract` and
`interact_contract` handlers call `await ctx!.getPrivateKeyForChain(chain_id)`
outside the `try`. Wrap each:

```typescript
      let privateKey: string | null;
      try {
        privateKey = await ctx!.getPrivateKeyForChain(chain_id);
      } catch (e: unknown) {
        audit({ action: 'deploy_contract', chain_id, status: 'denied', details: sanitizeError(e) });
        return { content: [{ type: 'text' as const, text: sanitizeError(e) }] };
      }
```

Use `action: 'interact_contract'` in the second handler.

- [ ] **Step 8: Verify everything is green**

Run: `npm run lint && npx vitest run --project unit`
Expected: type check clean, all unit tests pass.

Run: `export PATH="$HOME/.foundry/bin:$PATH" && npm run test:workstyle`
Expected: 54 tests pass. This is the real check — the anvil tier drives deploy
and write through a real vault, so it exercises the new read path end to end.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src
git commit -m "feat(mcp): decrypt agent vault per request, not at startup"
```

---

### Task 3: Check API rules before pulling the key

`query_explorer` and `verify_contract` resolve the API key first and check
`checkApiRequest` second, which inverts the project's rules-before-decryption
invariant. `listApiServices()` makes the correct order possible.

**Files:**
- Modify: `packages/core/src/mcp/tools/proxy-tools.ts:36-60`
- Modify: `packages/core/src/mcp/tools/chain-tools.ts` (`verify_contract` handler)
- Test: `packages/core/src/mcp/tools/proxy-tools.test.ts`
- Test: `packages/core/src/mcp/tools/chain-tools.test.ts`

**Interfaces:**
- Consumes: `listApiServices()` from Task 2.
- Produces: `resolveExplorerService(ctx, explorerApiUrl)` exported from
  `packages/core/src/mcp/tools/explorer-service.ts`, returning
  `Promise<string | null>` — the configured service name matching that
  explorer URL, or `null`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/mcp/tools/proxy-tools.test.ts`:

```typescript
describe('query_explorer checks rules before touching a key', () => {
  it('denies a non-whitelisted endpoint without ever calling the key accessor', async () => {
    const server = createFakeServer();
    const getApiKeyForExplorer = vi.fn(async () => ({ serviceName: 'etherscan', key: 'SECRET_KEY' }));
    const ctx = {
      agentName: 'a',
      config: {
        api_access: { etherscan: { allowed_endpoints: ['getabi'], rate_limit: { per_second: 5, daily: 100 } } },
      },
      rules: {
        checkApiRequest: () => ({ approved: false, reason: "Endpoint 'txlist' is not in the allowed endpoint list" }),
      },
      keys: [],
      listApiServices: async () => [{ name: 'etherscan', baseUrl: 'https://api.etherscan.io' }],
      getApiKeyForExplorer,
      getPrivateKeyForChain: async () => null,
      getApiKey: async () => null,
      getRpcUrlForChain: async () => null,
      dispose: () => {},
    } as unknown as AgentContext;

    registerProxyTools(server as any, () => ctx);
    const res = await server.handlers.get('query_explorer')!({
      chain_id: 11155111, module: 'account', action: 'txlist',
    });

    expect(res.content[0].text).toMatch(/txlist/);
    // The whole point: a denied request must not decrypt anything.
    expect(getApiKeyForExplorer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/core/src/mcp/tools/proxy-tools.test.ts --project unit`
Expected: FAIL — `expected "spy" to not be called` (the handler still resolves
the key before checking rules).

- [ ] **Step 3: Add the shared resolver**

Create `packages/core/src/mcp/tools/explorer-service.ts`:

```typescript
import type { AgentContext } from '../context.js';

/**
 * Finds the configured API service whose base URL matches an explorer URL,
 * using registrable-domain equality — the same rule as getApiKeyForExplorer,
 * but returning only the service name so rules can be checked before any key
 * is decrypted.
 */
export async function resolveExplorerService(
  ctx: AgentContext,
  explorerApiUrl: string,
): Promise<string | null> {
  let explorerDomain: string;
  try {
    explorerDomain = new URL(explorerApiUrl).hostname.split('.').slice(-2).join('.');
  } catch {
    return null;
  }

  for (const service of await ctx.listApiServices()) {
    try {
      const serviceDomain = new URL(service.baseUrl).hostname.split('.').slice(-2).join('.');
      if (serviceDomain === explorerDomain) return service.name;
    } catch { continue; }
  }
  return null;
}
```

- [ ] **Step 4: Reorder `query_explorer`**

In `packages/core/src/mcp/tools/proxy-tools.ts`, replace the block that resolves
the key and then checks rules with:

```typescript
      // Resolve the service from base URLs only, so the endpoint whitelist is
      // enforced before any key is decrypted.
      const serviceName = await resolveExplorerService(ctx, explorerApiUrl);
      if (!serviceName) {
        audit({ action: 'query_explorer', chain_id, status: 'denied', details: 'No API key for explorer' });
        return { content: [{ type: 'text' as const, text: `No Etherscan API key configured for chain ${chain_id}. Add a single 'etherscan' key — Etherscan V2 covers every chain — via the TUI or CLI.` }] };
      }

      const apiCheck = ctx.rules.checkApiRequest({ service: serviceName, endpoint: action });
      if (!apiCheck.approved) {
        audit({ action: 'query_explorer', chain_id, status: 'denied', details: apiCheck.reason ?? 'API access denied' });
        return { content: [{ type: 'text' as const, text: apiCheck.reason ?? 'API access denied.' }] };
      }

      const apiKeyMatch = await ctx.getApiKeyForExplorer(explorerApiUrl);
      if (!apiKeyMatch) {
        audit({ action: 'query_explorer', chain_id, status: 'denied', details: 'No API key for explorer' });
        return { content: [{ type: 'text' as const, text: `No Etherscan API key configured for chain ${chain_id}.` }] };
      }
      const apiKeyValue = apiKeyMatch.key;
```

Replace the later uses of `serviceName` and `apiKeyValue` as they already appear.
Add the import:

```typescript
import { resolveExplorerService } from './explorer-service.js';
```

- [ ] **Step 5: Reorder `verify_contract`**

In `packages/core/src/mcp/tools/chain-tools.ts`, replace the block in the
`verify_contract` handler that resolves the key and then checks rules with:

```typescript
      const serviceName = await resolveExplorerService(ctx!, explorerApiUrl);
      if (!serviceName) {
        audit({ action: 'verify_contract', chain_id, status: 'denied', details: 'No API key for explorer' });
        return { content: [{ type: 'text' as const, text: `No Etherscan API key configured for chain ${chain_id}. Add a single 'etherscan' key — Etherscan V2 covers every chain — via the TUI or CLI.` }] };
      }

      // Endpoint whitelist first, key second.
      const apiCheck = ctx!.rules.checkApiRequest({
        service: serviceName,
        endpoint: VERIFY_ACTION,
      });
      if (!apiCheck.approved) {
        audit({ action: 'verify_contract', chain_id, status: 'denied', details: apiCheck.reason ?? 'API access denied' });
        return { content: [{ type: 'text' as const, text: apiCheck.reason ?? 'API access denied.' }] };
      }

      const apiKeyMatch = await ctx!.getApiKeyForExplorer(explorerApiUrl);
      if (!apiKeyMatch) {
        audit({ action: 'verify_contract', chain_id, status: 'denied', details: 'No API key for explorer' });
        return { content: [{ type: 'text' as const, text: `No Etherscan API key configured for chain ${chain_id}.` }] };
      }
```

The later `apiKeyMatch.serviceName` reference in the `apiProxy.request` call
becomes `serviceName`. Add the import:

```typescript
import { resolveExplorerService } from './explorer-service.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/tools/ --project unit`
Expected: PASS. The existing `verify_contract` and `query_explorer` doubles need
`listApiServices: async () => [{ name: 'etherscan', baseUrl: 'https://api.etherscan.io' }]`
added; without it `resolveExplorerService` returns `null` and those tests fail
with the "No Etherscan API key configured" message.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/mcp/tools
git commit -m "fix(mcp): check API rules before decrypting the explorer key"
```

---

### Task 4: Drop the vault key from the environment, add close()

**Files:**
- Modify: `packages/core/src/mcp/server.ts:41-50`
- Modify: `packages/cli/src/commands/serve.ts`
- Test: `packages/core/src/mcp/server.test.ts`

**Interfaces:**
- Consumes: `AgentContext.dispose()` from Task 2.
- Produces: `ChainVaultServer.close(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/mcp/server.test.ts`:

```typescript
describe('vault key handling', () => {
  const KEY = 'cv_agent_' + '0'.repeat(64);

  afterEach(() => {
    delete process.env.CHAINVAULT_VAULT_KEY;
  });

  it('removes the vault key from the environment after init', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chainvault-server-'));
    process.env.CHAINVAULT_VAULT_KEY = KEY;

    const server = new ChainVaultServer({ basePath: dir });
    // No agent vaults exist here, so init throws — the env var must still be
    // cleared, otherwise a failed start leaves the key sitting in the process.
    await server.init().catch(() => {});

    expect(process.env.CHAINVAULT_VAULT_KEY).toBeUndefined();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });
});
```

Add the imports this file needs:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/core/src/mcp/server.test.ts --project unit`
Expected: FAIL — `expected 'cv_agent_000…' to be undefined`, and
`server.close is not a function`.

- [ ] **Step 3: Clear the variable and add close()**

In `packages/core/src/mcp/server.ts`, replace the body of `init()`:

```typescript
  async init(): Promise<void> {
    this.db = new ChainVaultDB(this.config.basePath);
    this.auditStore = new AuditStore(this.db);
    const spendStore = new SpendStore(this.db);

    const vaultKey = this.config.vaultKey || process.env.CHAINVAULT_VAULT_KEY;
    // The key is held as a buffer in the context from here on. Leaving it in the
    // environment would keep it readable from /proc/<pid>/environ and from any
    // accidental process.env dump for the whole session. Cleared even when the
    // context fails to build.
    delete process.env.CHAINVAULT_VAULT_KEY;

    this.agentContext = await createAgentContext(
      this.config.basePath,
      vaultKey,
      { spendStore },
    );
  }

  async close(): Promise<void> {
    this.agentContext?.dispose();
    this.agentContext = null;
    this.db?.close();
    this.db = null;
    this.auditStore = null;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/core/src/mcp/server.test.ts --project unit`
Expected: PASS.

- [ ] **Step 5: Close the server on CLI shutdown**

In `packages/cli/src/commands/serve.ts`, after `await server.init();` and the
transport connection, register:

```typescript
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
```

- [ ] **Step 6: Verify everything is green**

Run: `npm run lint && npx vitest run --project unit`
Expected: type check clean, all unit tests pass.

Run: `export PATH="$HOME/.foundry/bin:$PATH" && npm run test:workstyle`
Expected: 54 tests pass. The workstyle harness spawns real servers, so a broken
`close()` shows up here as a hang or an open handle.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/mcp/server.ts packages/core/src/mcp/server.test.ts packages/cli/src/commands/serve.ts
git commit -m "feat(mcp): clear vault key from env and add server close()"
```

---

### Task 5: Document the model honestly and bump the version

**Files:**
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`, `packages/core/package.json`, `packages/cli/package.json`
- Modify: `docs/plans/2026-03-19-chainvault-mcp-design.md` (Section 3)

**Interfaces:**
- Consumes: everything above. Produces no code.

- [ ] **Step 1: Add the memory section to SECURITY.md**

Insert after the `## Security Model` bullet list:

```markdown
### Secrets in memory

Agent secrets are decrypted for a single operation and then go out of scope.
`AgentContext` retains only the agent's vault key; every private key, API key,
and RPC URL is re-read from the encrypted vault file at the moment it is used.

What this gives you:

- **Revocation takes effect immediately.** Rotating an agent key, regenerating
  its grants, or revoking it invalidates a running server on its very next tool
  call — not at the next reconnect.
- **A smaller accident surface.** Plaintext key material is resident for
  milliseconds rather than for the session, which limits what a heap dump, core
  dump, swap page, or crash reporter can capture.

What it does not give you, stated plainly so it is not mistaken for more:

- **It is not protection against an attacker who can read host memory.** That
  attacker holds the vault key and can decrypt the vault file directly. Running
  the server on a host you do not trust is outside the model.
- **JavaScript strings are immutable and cannot be zeroed.** Assignments such as
  `params.privateKey = ''` in the chain adapter drop a reference so the value
  becomes collectable; they do not scrub the bytes. Only `Buffer` key material —
  the vault and master keys — is genuinely wiped, via `wipeBuffer`.

The vault key is passed in `CHAINVAULT_VAULT_KEY` and removed from the process
environment as soon as the server has read it.
```

- [ ] **Step 2: Add the changelog entry**

Under `## Unreleased` in `CHANGELOG.md`:

```markdown
- **Per-request vault decryption (#10, #28):** the MCP server no longer holds
  decrypted agent secrets for its lifetime. `AgentContext` keeps only the vault
  key and re-reads the encrypted vault for each secret access, so rotating or
  revoking an agent invalidates a running server immediately instead of at the
  next reconnect. The vault key is also removed from `process.env` once read.
  SECURITY.md now states what this does and does not protect against.
- API endpoint rules are checked before the explorer key is decrypted, restoring
  the rules-before-decryption ordering in `query_explorer` and `verify_contract`.
- **Breaking (internal):** the four secret accessors on the exported
  `AgentContext` type are now async. This is server plumbing with no known
  external consumer, hence a minor bump rather than a major one.
```

- [ ] **Step 3: Bump the version to 1.2.0**

Set `"version": "1.2.0"` in `package.json`, `packages/core/package.json`, and
`packages/cli/package.json`, and update the CLI's dependency on core to
`"@chainvault/core": "^1.2.0"`.

Also update the hardcoded server version in
`packages/core/src/mcp/server.ts` — it still reads `version: '1.0.1'`, which is
already stale and will be reported to every MCP client:

```typescript
        version: '1.2.0',
```

- [ ] **Step 4: Correct the design doc**

In `docs/plans/2026-03-19-chainvault-mcp-design.md`, Section 3 says
"Decrypted per-request: vault opens, secret extracted, operation performed,
secret wiped, vault locks." That is now true for the vault read, but "secret
wiped" overstates what JavaScript can do. Replace that sentence with:

```markdown
- Decrypted per-request: the vault file is re-read and decrypted for each secret
  access, and the decrypted structure goes out of scope when the call returns.
  Buffer-backed key material is zeroed; string secrets cannot be, since
  JavaScript strings are immutable (see SECURITY.md).
```

- [ ] **Step 5: Rename the `## Unreleased` heading**

Change `## Unreleased` to `## 1.2.0 — YYYY-MM-DD` in `CHANGELOG.md`, using the
release date from `date +%Y-%m-%d`.

- [ ] **Step 6: Final verification**

Run: `npm run lint && npx vitest run --project unit`
Expected: type check clean, all unit tests pass.

Run: `export PATH="$HOME/.foundry/bin:$PATH" && npm run test:workstyle`
Expected: 54 tests pass.

- [ ] **Step 7: Commit**

```bash
git add SECURITY.md CHANGELOG.md package.json packages docs/plans
git commit -m "docs: state the in-memory secret model, bump to 1.2.0"
```

---

## Verification Beyond the Gates

The nightly tiers cannot run locally without secrets, but both exercise this
change and should be watched on the first nightly after merge:

- **testnet** — deploys, writes, and verifies on Sepolia through a real vault,
  so every async accessor is driven end to end against a live chain.
- **fork** — mainnet protocol reads through the same context.

If either fails with `VaultUnavailableError`, the cause is almost certainly a
vault file being read from a path that moved, not a rotation.
