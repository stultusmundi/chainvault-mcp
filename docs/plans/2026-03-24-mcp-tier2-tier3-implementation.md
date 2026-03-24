# MCP Tool Wiring (Tier 2 + Tier 3) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the remaining 5 MCP tool stubs (deploy_contract, interact_contract, verify_contract, query_explorer, query_price) to their backend modules, and fix the build system.

**Architecture:** Write tools extract private keys from `ctx.vaultData.keys` scoped to the adapter call. Proxy tools use `ApiProxy` with API keys from `ctx.vaultData.api_keys`. `registerProxyTools` gains a `getContext` parameter. Build switches from tsc to esbuild.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server`, `viem` (via `EvmAdapter`), `ApiProxy`, `vitest`, `esbuild`

**Design Doc:** `docs/plans/2026-03-24-mcp-tier2-tier3-design.md`

---

## Task 1: Wire deploy_contract and interact_contract

**Files:**
- Modify: `packages/core/src/mcp/tools/chain-tools.ts`
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

These two tools follow the same pattern: check rules → find private key → call EvmAdapter → record spend → return hash.

**Step 1: Write failing tests**

Add to `mcp-integration.e2e.test.ts` inside the "Vault tools (with agent context)" describe block. The test agent config has `allowed_types: ['read', 'simulate']` so deploy/write should be DENIED by rules:

```typescript
describe('Chain write tools (rules enforcement)', () => {
  it('deploy_contract denied when agent lacks deploy permission', async () => {
    const result = await ctxClient.callTool({
      name: 'deploy_contract',
      arguments: {
        chain_id: 11155111,
        abi: '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}]',
        bytecode: '0x608060405234801561001057600080fd5b50',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('not allowed');
  });

  it('interact_contract denied when agent lacks write permission', async () => {
    const result = await ctxClient.callTool({
      name: 'interact_contract',
      arguments: {
        chain_id: 11155111,
        address: '0x0000000000000000000000000000000000000001',
        abi: '[{"inputs":[],"name":"foo","outputs":[],"stateMutability":"nonpayable","type":"function"}]',
        function_name: 'foo',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('not allowed');
  });

  it('deploy_contract denied for unauthorized chain', async () => {
    const result = await ctxClient.callTool({
      name: 'deploy_contract',
      arguments: {
        chain_id: 1,
        abi: '[]',
        bytecode: '0x00',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('does not have access');
  });

  it('deploy_contract returns error without agent context', async () => {
    const result = await client.callTool({
      name: 'deploy_contract',
      arguments: {
        chain_id: 11155111,
        abi: '[]',
        bytecode: '0x00',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('CHAINVAULT_VAULT_KEY');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: FAIL — tools still return "Not yet implemented".

**Step 3: Implement deploy_contract and interact_contract handlers**

In `chain-tools.ts`, add a helper to find the private key and a helper for write-operation rules checking:

```typescript
function checkWriteAccess(
  ctx: AgentContext | null,
  chainId: number,
  txType: 'deploy' | 'write' | 'transfer',
  value: string = '0',
  toAddress?: string,
): string | null {
  if (!ctx) return 'No agent context. Set CHAINVAULT_VAULT_KEY.';
  const result = ctx.rules.checkTxRequest({
    type: txType,
    chain_id: chainId,
    value,
    to_address: toAddress,
  });
  if (!result.approved) return result.reason ?? `Operation denied.`;
  return null;
}

function getPrivateKey(ctx: AgentContext, chainId: number): string | null {
  for (const [, key] of Object.entries(ctx.vaultData.keys)) {
    if (key.chains.includes(chainId)) {
      return key.private_key;
    }
  }
  return null;
}
```

Replace `deploy_contract` handler:

```typescript
async ({ chain_id, abi, bytecode, constructor_args }) => {
  const ctx = getContext();
  const err = checkWriteAccess(ctx, chain_id, 'deploy');
  if (err) return { content: [{ type: 'text' as const, text: err }] };

  const privateKey = getPrivateKey(ctx!, chain_id);
  if (!privateKey) return { content: [{ type: 'text' as const, text: `No key available for chain ${chain_id}.` }] };

  try {
    const adapter = EvmAdapter.fromChainId(chain_id);
    const parsedAbi = JSON.parse(abi);
    const result = await adapter.deployContract({
      abi: parsedAbi,
      bytecode,
      args: constructor_args,
      privateKey,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        hash: result.hash,
        contractAddress: result.address ?? null,
      }, null, 2) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
  }
},
```

Replace `interact_contract` handler:

```typescript
async ({ chain_id, address, abi, function_name, args, value }) => {
  const ctx = getContext();
  const err = checkWriteAccess(ctx, chain_id, 'write', value ?? '0', address);
  if (err) return { content: [{ type: 'text' as const, text: err }] };

  const privateKey = getPrivateKey(ctx!, chain_id);
  if (!privateKey) return { content: [{ type: 'text' as const, text: `No key available for chain ${chain_id}.` }] };

  try {
    const adapter = EvmAdapter.fromChainId(chain_id);
    const parsedAbi = JSON.parse(abi);
    const result = await adapter.writeContract({
      address,
      abi: parsedAbi,
      functionName: function_name,
      args: args ?? [],
      privateKey,
      value,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ hash: result.hash }, null, 2) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
  }
},
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/mcp/tools/chain-tools.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire deploy_contract and interact_contract with rules enforcement"
```

---

## Task 2: Wire verify_contract

**Files:**
- Modify: `packages/core/src/mcp/tools/chain-tools.ts`
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

Etherscan contract verification uses a POST to their API with source code, compiler version, and ABI. We look up the explorer API URL from the chain registry and use the API key from the agent vault.

**Step 1: Write failing test**

```typescript
it('verify_contract denied without API key for explorer', async () => {
  // The test agent has no api_access configured
  const result = await ctxClient.callTool({
    name: 'verify_contract',
    arguments: {
      chain_id: 11155111,
      address: '0x0000000000000000000000000000000000000001',
      source_code: 'pragma solidity ^0.8.20; contract X {}',
      contract_name: 'X',
      compiler_version: '0.8.20',
    },
  });
  const text = (result.content as any)[0].text;
  // Should fail because agent has no API keys
  expect(text).toMatch(/no.*api.*key|not configured/i);
});
```

**Step 2: Implement verify_contract handler**

Replace the stub with:

```typescript
async ({ chain_id, address, source_code, contract_name, compiler_version, optimization }) => {
  const ctx = getContext();
  if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

  // Find explorer API URL from chain config
  const chainConfig = (await import('../../chain/chains.js')).getChainConfig(chain_id);
  if (!chainConfig?.blockExplorer?.apiUrl) {
    return { content: [{ type: 'text' as const, text: `No block explorer API configured for chain ${chain_id}.` }] };
  }

  // Find an API key for the explorer
  const apiKeyEntry = Object.values(ctx.vaultData.api_keys).find(
    (ak) => chainConfig.blockExplorer!.apiUrl!.includes(new URL(ak.base_url).hostname.split('.').slice(-2).join('.')),
  );
  if (!apiKeyEntry) {
    return { content: [{ type: 'text' as const, text: `No API key configured for ${chainConfig.blockExplorer.name}. Add one with 'chainvault api add'.` }] };
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKeyEntry.key,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: address,
      sourceCode: source_code,
      codeformat: 'solidity-single-file',
      contractname: contract_name,
      compilerversion: `v${compiler_version}`,
      optimizationUsed: optimization ? '1' : '0',
    });

    const response = await fetch(`${chainConfig.blockExplorer.apiUrl}/api`, {
      method: 'POST',
      body: params,
    });
    const data = await response.json();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
  }
},
```

**Step 3: Run tests**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: All tests PASS.

**Step 4: Commit**

```bash
git add packages/core/src/mcp/tools/chain-tools.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire verify_contract to block explorer verification API"
```

---

## Task 3: Wire query_explorer and query_price

**Files:**
- Modify: `packages/core/src/mcp/tools/proxy-tools.ts`
- Modify: `packages/core/src/mcp/server.ts` (pass getContext to registerProxyTools)
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Proxy tools', () => {
  it('query_explorer denied without API key', async () => {
    // ctxClient's agent has no api_access
    const result = await ctxClient.callTool({
      name: 'query_explorer',
      arguments: {
        chain_id: 11155111,
        module: 'contract',
        action: 'getabi',
        params: { address: '0x0000000000000000000000000000000000000001' },
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toMatch(/no.*api.*key|not configured/i);
  });

  it('query_explorer returns error without agent context', async () => {
    const result = await client.callTool({
      name: 'query_explorer',
      arguments: {
        chain_id: 11155111,
        module: 'contract',
        action: 'getabi',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('CHAINVAULT_VAULT_KEY');
  });

  it('query_price returns price data (public API)', async () => {
    // query_price uses public CoinGecko API — no API key needed
    // This is a live API call, so we just verify structure
    const result = await client.callTool({
      name: 'query_price',
      arguments: { token_id: 'ethereum' },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    // Should have a price field or an error
    expect(parsed.ethereum?.usd ?? parsed.error).toBeDefined();
  });
});
```

**Step 2: Update server.ts to pass getContext to registerProxyTools**

In `packages/core/src/mcp/server.ts`, change:
```typescript
registerProxyTools(this.mcpServer);
```
to:
```typescript
registerProxyTools(this.mcpServer, getContext);
```

**Step 3: Implement proxy tools**

```typescript
// packages/core/src/mcp/tools/proxy-tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';
import { getChainConfig } from '../../chain/chains.js';
import { ApiProxy } from '../../proxy/api-proxy.js';

type ContextGetter = () => AgentContext | null;

const proxy = new ApiProxy();

export function registerProxyTools(server: McpServer, getContext: ContextGetter): void {
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
    async ({ chain_id, module: mod, action, params: extraParams }) => {
      const ctx = getContext();
      if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

      // Find explorer API URL
      const chainConfig = getChainConfig(chain_id);
      if (!chainConfig?.blockExplorer?.apiUrl) {
        return { content: [{ type: 'text' as const, text: `No block explorer API for chain ${chain_id}.` }] };
      }

      // Find API key matching this explorer
      const explorerHost = new URL(chainConfig.blockExplorer.apiUrl).hostname;
      const apiKeyEntry = Object.entries(ctx.vaultData.api_keys).find(
        ([, ak]) => {
          try { return new URL(ak.base_url).hostname.includes(explorerHost.split('.').slice(-2, -1)[0]); }
          catch { return false; }
        },
      );

      if (!apiKeyEntry) {
        return { content: [{ type: 'text' as const, text: `No API key configured for ${chainConfig.blockExplorer.name}. Add one via the TUI or CLI.` }] };
      }

      const [serviceName, apiKey] = apiKeyEntry;

      // Check API access rules
      const apiCheck = ctx.rules.checkApiRequest({ service: serviceName, endpoint: action });
      if (!apiCheck.approved) {
        return { content: [{ type: 'text' as const, text: apiCheck.reason ?? 'API access denied.' }] };
      }

      // Get rate limits from agent config
      const rateLimits = ctx.config.api_access[serviceName]?.rate_limit;

      try {
        const result = await proxy.request({
          baseUrl: chainConfig.blockExplorer.apiUrl,
          endpoint: '/api',
          params: { module: mod, action, ...(extraParams ?? {}) },
          apiKey: apiKey.key,
          rateLimits,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'query_price',
    {
      title: 'Get Token Price',
      description: 'Get current token price data from CoinGecko',
      inputSchema: z.object({
        token_id: z.string().describe('Token identifier (e.g., "ethereum", "bitcoin")'),
        currency: z.string().optional().describe('Target currency (default: "usd")'),
      }),
    },
    async ({ token_id, currency }) => {
      const cur = currency ?? 'usd';
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(token_id)}&vs_currencies=${encodeURIComponent(cur)}`;
        const response = await fetch(url);
        if (!response.ok) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `CoinGecko API error: ${response.status}` }) }] };
        }
        const data = await response.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: e.message }) }] };
      }
    },
  );
}
```

**Step 4: Run tests**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/mcp/tools/proxy-tools.ts packages/core/src/mcp/server.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire query_explorer and query_price to ApiProxy and CoinGecko"
```

---

## Task 4: Esbuild-based Build Script

**Files:**
- Create: `scripts/build.sh`
- Modify: `package.json` (update build script)

The current `npm run build` runs `tsc` which OOMs due to viem's massive type definitions. Replace with esbuild for transpilation (type checking stays via `npx tsc --noEmit`).

**Step 1: Create build script**

```bash
#!/usr/bin/env bash
# scripts/build.sh — Transpile TypeScript to dist using esbuild
# tsc OOMs on viem types, so we use esbuild for transpilation
# Type checking: npx tsc --noEmit (separate step)

set -e

echo "Building @chainvault/core..."
find packages/core/src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/core/dist/$(dirname "${f#packages/core/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --outdir="$outdir" --log-level=warning
done

echo "Building @chainvault/cli..."
find packages/cli/src -name "*.ts" ! -name "*.tsx" ! -name "*.test.ts" ! -name "*.e2e.test.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/cli/dist/$(dirname "${f#packages/cli/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --outdir="$outdir" --log-level=warning
done

echo "Build complete."
```

**Step 2: Update root package.json**

Change the build script from:
```json
"build": "npm run build --workspaces"
```
to:
```json
"build": "bash scripts/build.sh"
```

**Step 3: Make executable and test**

Run: `chmod +x scripts/build.sh && npm run build`
Expected: All files transpiled, no errors.

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add scripts/build.sh package.json
git commit -m "chore: replace tsc build with esbuild (fixes OOM on viem types)"
```

---

## Task 5: Final Verification + Dist Rebuild

**Step 1: Rebuild dist**

Run: `npm run build`

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 3: Test serve with agent context**

Run:
```bash
CHAINVAULT_VAULT_KEY=cv_agent_687c8827ae5f6d601d9b33cabf5e1fef7713ba0ea8fe0275bdeab289c7ac5280 node packages/cli/dist/index.js serve -p .chainvault-dev
```
Expected: `ChainVault MCP server running on stdio (agent: dev-agent)`

**Step 4: Verify no stubs remain**

Run: `grep -r "Not yet implemented" packages/core/src/mcp/tools/`
Expected: No matches.

---

## Task Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Wire deploy_contract + interact_contract | 4 |
| 2 | Wire verify_contract | 1 |
| 3 | Wire query_explorer + query_price | 3 |
| 4 | Esbuild build script | 0 (manual) |
| 5 | Final verification | 0 (integration) |

**Total: ~8 new tests, 5 tasks**
