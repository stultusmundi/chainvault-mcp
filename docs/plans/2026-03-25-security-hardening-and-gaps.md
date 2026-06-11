# Security Hardening & Design Gap Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical security invariant violations (secret wiping) and implement missing design features (auto-lock, agent vault regeneration, API proxy resilience).

**Architecture:** Targeted fixes across vault, chain, and proxy modules. No new modules — strengthening existing code.

**Tech Stack:** TypeScript, Node.js crypto, viem, vitest.

---

## Task 1: Add `wipeString` and `wipeBuffer` helpers to crypto module

**Files:**
- Modify: `packages/core/src/vault/crypto.ts`
- Modify: `packages/core/src/vault/crypto.test.ts`

**Step 1: Write failing tests**

Add to `packages/core/src/vault/crypto.test.ts`:

```typescript
describe('wipeBuffer', () => {
  it('fills buffer with zeros', () => {
    const buf = Buffer.from('secret-key-material');
    wipeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('handles null/undefined gracefully', () => {
    expect(() => wipeBuffer(null as any)).not.toThrow();
    expect(() => wipeBuffer(undefined as any)).not.toThrow();
  });
});
```

**Step 2: Run test to verify failure**

Run: `npx vitest run packages/core/src/vault/crypto.test.ts`
Expected: FAIL — `wipeBuffer` not exported.

**Step 3: Implement in `packages/core/src/vault/crypto.ts`**

Add at the end of the file:

```typescript
/**
 * Wipes a Buffer by filling with zeros. Safe to call with null/undefined.
 */
export function wipeBuffer(buf: Buffer | null | undefined): void {
  if (buf) buf.fill(0);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/vault/crypto.test.ts`
Expected: All PASS.

**Step 5: Export from core index**

Add `wipeBuffer` to the crypto exports in `packages/core/src/index.ts`.

**Step 6: Commit**

```
feat(vault): add wipeBuffer helper for secret memory cleanup
```

---

## Task 2: Wipe private keys after signing in EvmAdapter

**Files:**
- Modify: `packages/core/src/chain/evm-adapter.ts`
- Modify: `packages/core/src/chain/evm-write.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/chain/evm-write.test.ts`:

```typescript
it('wipes private key from params after deploy', async () => {
  const params = {
    abi: [{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' }],
    bytecode: '0x608060405260405161083e',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  };
  await adapter.deployContract(params);
  expect(params.privateKey).toBe('');
});

it('wipes private key from params after writeContract', async () => {
  const params = {
    address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
    abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
    functionName: 'mint',
    args: [],
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  };
  await adapter.writeContract(params);
  expect(params.privateKey).toBe('');
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run packages/core/src/chain/evm-write.test.ts`
Expected: FAIL — `params.privateKey` still contains the key.

**Step 3: Add wiping to `deployContract` and `writeContract`**

In `packages/core/src/chain/evm-adapter.ts`, modify `deployContract`:

After `const receipt = await this.client.waitForTransactionReceipt({ hash });`, add before the return:

```typescript
// Wipe private key from params
params.privateKey = '';
```

Also wrap in try/finally so the key is wiped even on error:

```typescript
async deployContract(params: DeployParams): Promise<{ hash: string; address?: string }> {
  try {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const chain = this.getChain();
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(this.rpcUrl),
    });

    const hash = await walletClient.deployContract({
      abi: params.abi,
      bytecode: params.bytecode as `0x${string}`,
      args: params.args || [],
      account,
      chain,
    });

    const receipt = await this.client.waitForTransactionReceipt({ hash });

    return {
      hash,
      address: receipt.contractAddress ?? undefined,
    };
  } finally {
    params.privateKey = '';
  }
}
```

Same pattern for `writeContract`:

```typescript
async writeContract(params: WriteContractParams): Promise<{ hash: string }> {
  try {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const chain = this.getChain();
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(this.rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: params.address as `0x${string}`,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      account,
      chain,
      value: params.value ? BigInt(params.value) : undefined,
    });

    return { hash };
  } finally {
    params.privateKey = '';
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/chain/evm-write.test.ts`
Expected: All PASS.

**Step 5: Commit**

```
fix(chain): wipe private keys from params after signing operations
```

---

## Task 3: Wipe key buffer in agent vault operations

**Files:**
- Modify: `packages/core/src/vault/agent-vault.ts`
- Modify: `packages/core/src/vault/agent-vault.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/vault/agent-vault.test.ts` inside `describe('createAgent')`:

```typescript
it('wipes key buffer after creating agent vault', async () => {
  const manager = new AgentVaultManager(testDir, masterVault);
  // We can't directly test buffer wiping from outside, but we verify
  // the vault still works after creation (key was used then wiped)
  const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
  const agentData = await manager.openAgentVault('deployer', result.vaultKey);
  expect(agentData.agent_name).toBe('deployer');
});
```

**Step 2: Modify `agent-vault.ts`**

Import `wipeBuffer` from crypto and add wiping after key use:

In `createAgent`, after `writeFile`:
```typescript
wipeBuffer(keyBuffer);
```

In `openAgentVault`, after `decrypt`:
```typescript
const decrypted = decrypt(encrypted, keyBuffer);
wipeBuffer(keyBuffer);
```

In `rotateAgentKey`, after `writeFile`:
```typescript
wipeBuffer(keyBuffer);
```

**Step 3: Run tests**

Run: `npx vitest run packages/core/src/vault/agent-vault.test.ts`
Expected: All PASS.

**Step 4: Commit**

```
fix(vault): wipe key buffers after agent vault operations
```

---

## Task 4: Add auto-lock timeout to MasterVault

**Files:**
- Modify: `packages/core/src/vault/master-vault.ts`
- Modify: `packages/core/src/vault/master-vault.test.ts`

**Step 1: Write failing tests**

Add to `packages/core/src/vault/master-vault.test.ts`:

```typescript
describe('auto-lock', () => {
  it('locks after timeout', async () => {
    await MasterVault.init(testDir, 'test-password');
    const vault = await MasterVault.unlock(testDir, 'test-password', { autoLockMs: 50 });
    expect(vault.isUnlocked()).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(vault.isUnlocked()).toBe(false);
  });

  it('does not auto-lock if timeout is 0', async () => {
    await MasterVault.init(testDir, 'test-password');
    const vault = await MasterVault.unlock(testDir, 'test-password', { autoLockMs: 0 });
    expect(vault.isUnlocked()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(vault.isUnlocked()).toBe(true);
    vault.lock();
  });

  it('clears timer on manual lock', async () => {
    await MasterVault.init(testDir, 'test-password');
    const vault = await MasterVault.unlock(testDir, 'test-password', { autoLockMs: 5000 });
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
    // Timer should be cleared, no dangling refs
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/master-vault.test.ts`
Expected: FAIL — `unlock` doesn't accept options.

**Step 3: Implement auto-lock**

Modify `packages/core/src/vault/master-vault.ts`:

Add `autoLockTimer` field to class:
```typescript
private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
```

Add options parameter to `unlock`:
```typescript
static async unlock(
  basePath: string,
  password: string,
  options?: { autoLockMs?: number },
): Promise<MasterVault> {
  // ... existing decrypt logic ...

  const vault = new MasterVault(basePath);
  vault.data = data;
  vault.masterKey = masterKey;

  // Auto-lock timer (default: 15 minutes, 0 = disabled)
  const autoLockMs = options?.autoLockMs ?? 15 * 60 * 1000;
  if (autoLockMs > 0) {
    vault.autoLockTimer = setTimeout(() => vault.lock(), autoLockMs);
    vault.autoLockTimer.unref(); // Don't prevent process exit
  }

  return vault;
}
```

Update `lock()` to clear the timer:
```typescript
lock(): void {
  if (this.autoLockTimer) {
    clearTimeout(this.autoLockTimer);
    this.autoLockTimer = null;
  }
  this.data = null;
  if (this.masterKey) {
    this.masterKey.fill(0);
    this.masterKey = null;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run packages/core/src/vault/master-vault.test.ts`
Expected: All PASS.

**Step 5: Commit**

```
feat(vault): add auto-lock timeout to MasterVault (default 15 min)
```

---

## Task 5: Add `regenerateAgent` to AgentVaultManager

**Files:**
- Modify: `packages/core/src/vault/agent-vault.ts`
- Modify: `packages/core/src/vault/agent-vault.test.ts`

**Step 1: Write failing tests**

Add to `packages/core/src/vault/agent-vault.test.ts`:

```typescript
describe('regenerateAgent', () => {
  it('regenerates vault with updated config from master', async () => {
    const manager = new AgentVaultManager(testDir, masterVault);
    const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);

    // Admin changes config in master vault
    const data = masterVault.getData();
    data.agents['deployer'].chains = [1, 11155111]; // added mainnet
    await masterVault.saveData();

    // Regenerate
    const newResult = await manager.regenerateAgent('deployer', result.vaultKey, ['my-wallet'], ['etherscan']);

    // New key works
    const agentData = await manager.openAgentVault('deployer', newResult.vaultKey);
    expect(agentData.config.chains).toEqual([1, 11155111]);

    // Old key no longer works
    await expect(manager.openAgentVault('deployer', result.vaultKey)).rejects.toThrow();
  });

  it('updates granted keys on regeneration', async () => {
    const manager = new AgentVaultManager(testDir, masterVault);
    const result = await manager.createAgent(DEPLOYER_CONFIG, [], []);

    // Regenerate with keys now granted
    const newResult = await manager.regenerateAgent('deployer', result.vaultKey, ['my-wallet'], []);
    const agentData = await manager.openAgentVault('deployer', newResult.vaultKey);
    expect(Object.keys(agentData.keys)).toEqual(['my-wallet']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/vault/agent-vault.test.ts`
Expected: FAIL — `regenerateAgent` doesn't exist.

**Step 3: Implement `regenerateAgent`**

Add to `packages/core/src/vault/agent-vault.ts`:

```typescript
async regenerateAgent(
  agentName: string,
  currentVaultKey: string,
  grantedKeys: string[],
  grantedApiKeys: string[],
): Promise<{ vaultKey: string }> {
  // Verify old key works (proves caller has access)
  await this.openAgentVault(agentName, currentVaultKey);

  // Read updated config from master vault
  const masterData = this.masterVault.getData();
  const config = masterData.agents[agentName];
  if (!config) throw new Error(`Agent '${agentName}' not found in master vault`);

  // Build fresh agent vault data with current secrets
  const keys: AgentVaultData['keys'] = {};
  for (const keyName of grantedKeys) {
    if (masterData.keys[keyName]) keys[keyName] = masterData.keys[keyName];
  }

  const apiKeys: AgentVaultData['api_keys'] = {};
  for (const apiKeyName of grantedApiKeys) {
    if (masterData.api_keys[apiKeyName]) apiKeys[apiKeyName] = masterData.api_keys[apiKeyName];
  }

  const rpcEndpoints: AgentVaultData['rpc_endpoints'] = {};
  for (const [name, ep] of Object.entries(masterData.rpc_endpoints)) {
    if (config.chains.includes(ep.chain_id)) rpcEndpoints[name] = ep;
  }

  const agentVaultData: AgentVaultData = {
    version: 1,
    agent_name: agentName,
    config,
    keys,
    api_keys: apiKeys,
    rpc_endpoints: rpcEndpoints,
  };

  // Re-encrypt with new key
  const { keyString, keyBuffer } = generateVaultKeyString();
  const encrypted = encrypt(JSON.stringify(agentVaultData), keyBuffer);
  wipeBuffer(keyBuffer);

  await writeFile(join(this.basePath, AGENTS_DIR, `${agentName}.vault`), encrypted, 'utf8');

  return { vaultKey: keyString };
}
```

**Step 4: Run tests**

Run: `npx vitest run packages/core/src/vault/agent-vault.test.ts`
Expected: All PASS.

**Step 5: Export and commit**

```
feat(vault): add regenerateAgent for permission change propagation
```

---

## Task 6: Add timeout and retry to ApiProxy

**Files:**
- Modify: `packages/core/src/proxy/api-proxy.ts`
- Modify: `packages/core/src/proxy/api-proxy.test.ts`

**Step 1: Write failing tests**

Add to `packages/core/src/proxy/api-proxy.test.ts`:

```typescript
it('retries on transient failure then succeeds', async () => {
  mockFetch
    .mockRejectedValueOnce(new Error('network error'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'recovered' }),
    });

  const result = await proxy.request({
    baseUrl: 'https://api.etherscan.io',
    endpoint: '/api',
    params: { action: 'test' },
    apiKey: 'KEY',
    retries: 2,
  });
  expect(result.result).toBe('recovered');
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it('throws after exhausting retries', async () => {
  mockFetch.mockRejectedValue(new Error('network error'));

  await expect(
    proxy.request({
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: {},
      apiKey: 'KEY',
      retries: 2,
    }),
  ).rejects.toThrow('network error');
  expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
});

it('applies request timeout', async () => {
  mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves

  await expect(
    proxy.request({
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: {},
      apiKey: 'KEY',
      timeoutMs: 50,
    }),
  ).rejects.toThrow();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/proxy/api-proxy.test.ts`
Expected: FAIL.

**Step 3: Implement timeout and retry**

Update `RequestParams` interface in `api-proxy.ts`:
```typescript
interface RequestParams {
  baseUrl: string;
  endpoint: string;
  params: Record<string, string>;
  apiKey: string;
  rateLimits?: { per_second: number; daily: number };
  timeoutMs?: number;
  retries?: number;
}
```

Replace the fetch call section in `request()`:

```typescript
// Make request with timeout and retry
const maxAttempts = (params.retries ?? 0) + 1;
let lastError: Error | null = null;

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    const fetchOptions: RequestInit = {};
    if (params.timeoutMs) {
      fetchOptions.signal = AbortSignal.timeout(params.timeoutMs);
    }

    const response = await fetch(url.toString(), fetchOptions);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache result
    this.cache.set(cacheKey, { data, expiry: Date.now() + ApiProxy.CACHE_TTL });

    // Track usage
    this.trackUsage(params.baseUrl);

    return data;
  } catch (err: any) {
    lastError = err;
    // Don't retry on non-retryable errors (4xx status)
    if (err.message?.includes('4')) break;
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
}

throw lastError!;
```

**Step 4: Run tests**

Run: `npx vitest run packages/core/src/proxy/api-proxy.test.ts`
Expected: All PASS.

**Step 5: Commit**

```
feat(proxy): add timeout and retry support to ApiProxy
```

---

## Task 7: Full test suite verification and final commit

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Create PR**

Branch: `fix/security-hardening`
Title: `fix: security hardening and design gap fixes`

---

## Summary

| Task | Priority | Description |
|------|----------|-------------|
| 1 | Critical | `wipeBuffer` helper in crypto module |
| 2 | Critical | Wipe private keys after signing in EvmAdapter |
| 3 | Critical | Wipe key buffers in agent vault operations |
| 4 | Medium | Auto-lock timeout for MasterVault |
| 5 | Medium | `regenerateAgent` for permission change propagation |
| 6 | Medium | Timeout and retry for ApiProxy |
| 7 | — | Full verification and PR |
