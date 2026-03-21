# MCP Tool Wiring (Tier 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire 9 MCP tool stubs to their backend modules so agents can read chain state, discover capabilities, and compile Solidity contracts.

**Architecture:** `ChainVaultServer` reads `CHAINVAULT_VAULT_KEY` env var at startup, opens agent vault, caches config and `RulesEngine`. Tool registration functions receive a context object with the agent config, rules engine, and vault data. Each tool handler validates input, checks rules, calls the backend module, and returns structured JSON.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server`, `viem` (via `EvmAdapter`), `zod`, `vitest`

**Design Doc:** `docs/plans/2026-03-21-mcp-tool-wiring-design.md`

---

## Task 1: Agent Context in ChainVaultServer

**Files:**
- Modify: `packages/core/src/mcp/server.ts`
- Create: `packages/core/src/mcp/context.ts`
- Create: `packages/core/src/mcp/context.test.ts`

This task adds the agent context mechanism. The server reads `CHAINVAULT_VAULT_KEY`, opens the agent vault, and creates a shared context object passed to all tool registration functions.

**Step 1: Write failing tests**

```typescript
// packages/core/src/mcp/context.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault, AgentVaultManager } from '../vault/master-vault.js';
import { createAgentContext, type AgentContext } from './context.js';
import type { AgentConfig } from '../vault/types.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_PASSWORD = 'test-password';

const AGENT_CONFIG: AgentConfig = {
  name: 'test-agent',
  chains: [11155111],
  tx_rules: {
    allowed_types: ['read', 'simulate'],
    limits: {},
  },
  api_access: {},
  contract_rules: { mode: 'none' },
};

describe('createAgentContext', () => {
  let testDir: string;
  let vaultKey: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-ctx-'));
    await MasterVault.init(testDir, TEST_PASSWORD);
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('my-wallet', TEST_PRIVATE_KEY, [11155111]);
    const manager = new AgentVaultManager(testDir, vault);
    const result = await manager.createAgent(AGENT_CONFIG, ['my-wallet'], []);
    vaultKey = result.vaultKey;
    vault.lock();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates context with valid vault key', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    expect(ctx).toBeDefined();
    expect(ctx.agentName).toBe('test-agent');
    expect(ctx.config.chains).toEqual([11155111]);
    expect(ctx.rules).toBeDefined();
  });

  it('context has keys with public addresses only', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    expect(ctx.keys).toHaveLength(1);
    expect(ctx.keys[0].name).toBe('my-wallet');
    expect(ctx.keys[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    // Must NOT contain private key
    expect(JSON.stringify(ctx.keys)).not.toContain(TEST_PRIVATE_KEY);
  });

  it('throws with invalid vault key', async () => {
    await expect(
      createAgentContext(testDir, 'cv_agent_0000000000000000000000000000000000000000000000000000000000000000'),
    ).rejects.toThrow();
  });

  it('returns null context when no vault key provided', async () => {
    const ctx = await createAgentContext(testDir, undefined);
    expect(ctx).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/context.test.ts`
Expected: FAIL — module `./context.js` does not exist.

**Step 3: Implement context module**

```typescript
// packages/core/src/mcp/context.ts
import { AgentVaultManager } from '../vault/agent-vault.js';
import { RulesEngine } from '../rules/engine.js';
import type { AgentConfig, AgentVaultData } from '../vault/types.js';

export interface AgentKeyInfo {
  name: string;
  address: string;
  chains: number[];
}

export interface AgentContext {
  agentName: string;
  config: AgentConfig;
  rules: RulesEngine;
  keys: AgentKeyInfo[];
  vaultData: AgentVaultData;
}

export async function createAgentContext(
  basePath: string,
  vaultKey: string | undefined,
): Promise<AgentContext | null> {
  if (!vaultKey) return null;

  // Extract agent name from vault key by scanning vault files
  // The AgentVaultManager.openAgentVault needs the agent name,
  // but we can derive it by trying to find the matching vault file
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const agentsDir = join(basePath, 'agents');
  let files: string[];
  try {
    files = await readdir(agentsDir);
  } catch {
    throw new Error('No agent vaults found. Create an agent first.');
  }

  // Try each vault file with the provided key
  const manager = new AgentVaultManager(basePath, null as any);
  let vaultData: AgentVaultData | null = null;

  for (const file of files) {
    if (!file.endsWith('.vault')) continue;
    const agentName = file.replace('.vault', '');
    try {
      vaultData = await manager.openAgentVault(agentName, vaultKey);
      break;
    } catch {
      // Wrong key for this vault, try next
    }
  }

  if (!vaultData) {
    throw new Error('Invalid vault key — does not match any agent vault.');
  }

  const keys: AgentKeyInfo[] = Object.entries(vaultData.keys).map(
    ([name, key]) => ({
      name,
      address: key.address,
      chains: key.chains,
    }),
  );

  return {
    agentName: vaultData.agent_name,
    config: vaultData.config,
    rules: new RulesEngine(vaultData.config),
    keys,
    vaultData,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/context.test.ts`
Expected: All tests PASS.

**Step 5: Update ChainVaultServer to use context**

Modify `packages/core/src/mcp/server.ts` to:
- Accept optional `vaultKey` in config (defaults to `process.env.CHAINVAULT_VAULT_KEY`)
- Call `createAgentContext()` in a new `async init()` method
- Pass context to all `register*Tools()` functions

```typescript
// packages/core/src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVaultTools } from './tools/vault-tools.js';
import { registerChainTools } from './tools/chain-tools.js';
import { registerProxyTools } from './tools/proxy-tools.js';
import { registerCompilerTools } from './tools/compiler-tools.js';
import { registerChainRegistryTools } from './tools/chain-registry-tools.js';
import { createAgentContext, type AgentContext } from './context.js';

interface ServerConfig {
  basePath: string;
  vaultKey?: string;
}

export class ChainVaultServer {
  private mcpServer: McpServer;
  private registeredTools: string[] = [];
  private config: ServerConfig;
  private agentContext: AgentContext | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
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

  async init(): Promise<void> {
    const vaultKey = this.config.vaultKey || process.env.CHAINVAULT_VAULT_KEY;
    if (vaultKey) {
      try {
        this.agentContext = await createAgentContext(this.config.basePath, vaultKey);
      } catch (err: any) {
        console.error(`Warning: Failed to load agent context: ${err.message}`);
      }
    }
  }

  private registerAllTools(): void {
    const originalRegister = this.mcpServer.registerTool.bind(this.mcpServer);
    this.mcpServer.registerTool = ((name: string, ...args: any[]) => {
      this.registeredTools.push(name);
      return (originalRegister as any)(name, ...args);
    }) as any;

    // Pass a getter so tools always access the latest context
    const getContext = () => this.agentContext;

    registerVaultTools(this.mcpServer, getContext);
    registerChainTools(this.mcpServer, getContext);
    registerProxyTools(this.mcpServer);
    registerCompilerTools(this.mcpServer);
    registerChainRegistryTools(this.mcpServer);

    this.mcpServer.registerTool = originalRegister;
  }

  getRegisteredToolNames(): string[] {
    return [...this.registeredTools];
  }

  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  getAgentContext(): AgentContext | null {
    return this.agentContext;
  }
}
```

**Step 6: Update serve command to call init()**

Modify `packages/cli/src/commands/serve.ts`:

```typescript
import { ChainVaultServer } from '@chainvault/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function serve(basePath: string): Promise<void> {
  const server = new ChainVaultServer({ basePath });
  await server.init();
  const transport = new StdioServerTransport();
  await server.getMcpServer().connect(transport);
  const ctx = server.getAgentContext();
  if (ctx) {
    console.error(`ChainVault MCP server running on stdio (agent: ${ctx.agentName})`);
  } else {
    console.error('ChainVault MCP server running on stdio (no agent context — vault tools disabled)');
  }
}
```

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing tests shouldn't break since context is optional).

**Step 8: Commit**

```bash
git add packages/core/src/mcp/context.ts packages/core/src/mcp/context.test.ts packages/core/src/mcp/server.ts packages/cli/src/commands/serve.ts
git commit -m "feat(mcp): add agent context from CHAINVAULT_VAULT_KEY env var"
```

---

## Task 2: Wire Vault Tools (list_chains, list_capabilities, get_agent_address)

**Files:**
- Modify: `packages/core/src/mcp/tools/vault-tools.ts`
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

**Step 1: Write failing tests**

Add to `mcp-integration.e2e.test.ts`:

```typescript
describe('Vault tools (with agent context)', () => {
  // These tests need a server with agent context.
  // Create a temp vault, agent, and server instance for this describe block.
  let ctxClient: Client;
  let ctxServer: ChainVaultServer;
  let testDir: string;

  beforeAll(async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { MasterVault, AgentVaultManager } = await import('../vault/master-vault.js');

    testDir = await mkdtemp(join(tmpdir(), 'chainvault-mcp-vault-'));
    await MasterVault.init(testDir, 'test');
    const vault = await MasterVault.unlock(testDir, 'test');
    await vault.addKey('test-key', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1, 11155111]);
    const manager = new AgentVaultManager(testDir, vault);
    const { vaultKey } = await manager.createAgent({
      name: 'tester',
      chains: [11155111],
      tx_rules: { allowed_types: ['read', 'simulate'], limits: {} },
      api_access: {},
      contract_rules: { mode: 'none' },
    }, ['test-key'], []);
    vault.lock();

    ctxServer = new ChainVaultServer({ basePath: testDir, vaultKey });
    await ctxServer.init();

    const [ct, st] = InMemoryTransport.createLinkedPair();
    ctxClient = new Client({ name: 'test-ctx-client', version: '1.0.0' });
    await ctxServer.getMcpServer().connect(st);
    await ctxClient.connect(ct);
  });

  afterAll(async () => {
    await ctxClient.close();
    await ctxServer.getMcpServer().close();
    const { rm } = await import('node:fs/promises');
    await rm(testDir, { recursive: true, force: true });
  });

  it('list_chains returns agent allowed chains', async () => {
    const result = await ctxClient.callTool({ name: 'list_chains', arguments: {} });
    const text = (result.content as any)[0].text;
    const chains = JSON.parse(text);
    expect(chains).toContainEqual(expect.objectContaining({ chainId: 11155111 }));
    expect(chains.find((c: any) => c.chainId === 1)).toBeUndefined(); // not in agent config
  });

  it('list_capabilities returns agent rules summary', async () => {
    const result = await ctxClient.callTool({ name: 'list_capabilities', arguments: {} });
    const text = (result.content as any)[0].text;
    const caps = JSON.parse(text);
    expect(caps.allowed_types).toEqual(['read', 'simulate']);
    expect(caps.chains).toEqual([11155111]);
  });

  it('get_agent_address returns public address for allowed chain', async () => {
    const result = await ctxClient.callTool({ name: 'get_agent_address', arguments: { chain_id: 11155111 } });
    const text = (result.content as any)[0].text;
    expect(text).toMatch(/0x[a-fA-F0-9]{40}/);
    // Must NOT contain private key
    expect(text).not.toContain('0xac0974bec39a17');
  });

  it('get_agent_address returns error for unauthorized chain', async () => {
    const result = await ctxClient.callTool({ name: 'get_agent_address', arguments: { chain_id: 1 } });
    const text = (result.content as any)[0].text;
    expect(text).toContain('not have access');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: FAIL — tools still return stubs.

**Step 3: Implement vault tools**

```typescript
// packages/core/src/mcp/tools/vault-tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';
import { getChainConfig } from '../../chain/chains.js';

type ContextGetter = () => AgentContext | null;

export function registerVaultTools(server: McpServer, getContext: ContextGetter): void {
  server.registerTool(
    'list_chains',
    {
      title: 'List Accessible Chains',
      description: 'Show which blockchain networks this agent has access to',
      inputSchema: z.object({}),
    },
    async () => {
      const ctx = getContext();
      if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

      const chains = ctx.config.chains.map((chainId) => {
        const info = getChainConfig(chainId);
        return {
          chainId,
          name: info?.name ?? `Chain ${chainId}`,
          network: info?.network ?? 'unknown',
          nativeCurrency: info?.nativeCurrency.symbol ?? 'unknown',
        };
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(chains, null, 2) }] };
    },
  );

  server.registerTool(
    'list_capabilities',
    {
      title: 'List Agent Capabilities',
      description: 'Show what actions this agent is allowed to perform',
      inputSchema: z.object({}),
    },
    async () => {
      const ctx = getContext();
      if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

      const caps = {
        agent: ctx.agentName,
        chains: ctx.config.chains,
        allowed_types: ctx.config.tx_rules.allowed_types,
        api_access: Object.keys(ctx.config.api_access),
        contract_rules: ctx.config.contract_rules.mode,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(caps, null, 2) }] };
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
    async ({ chain_id }) => {
      const ctx = getContext();
      if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

      // Check chain access
      if (!ctx.config.chains.includes(chain_id)) {
        return { content: [{ type: 'text' as const, text: `Agent does not have access to chain ${chain_id}.` }] };
      }

      // Find a key that covers this chain
      const key = ctx.keys.find((k) => k.chains.includes(chain_id));
      if (!key) {
        return { content: [{ type: 'text' as const, text: `No key available for chain ${chain_id}.` }] };
      }

      return { content: [{ type: 'text' as const, text: key.address }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/mcp/tools/vault-tools.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire list_chains, list_capabilities, get_agent_address to agent context"
```

---

## Task 3: Wire Chain Read Tools (get_balance, get_contract_state, get_transaction, get_events, simulate_transaction)

**Files:**
- Modify: `packages/core/src/mcp/tools/chain-tools.ts`
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

All 5 tools follow the same pattern: check agent context → check rules → build `EvmAdapter.fromChainId()` → call method → return JSON.

**Step 1: Write failing tests**

Add to `mcp-integration.e2e.test.ts` inside the "Vault tools (with agent context)" describe block (reusing same ctxClient/ctxServer):

```typescript
describe('Chain read tools', () => {
  it('get_balance returns error for unauthorized chain', async () => {
    const result = await ctxClient.callTool({
      name: 'get_balance',
      arguments: { chain_id: 1, address: '0x0000000000000000000000000000000000000000' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('does not have access');
  });

  it('get_balance returns error without agent context', async () => {
    // Use the original no-context server/client
    const result = await client.callTool({
      name: 'get_balance',
      arguments: { chain_id: 11155111, address: '0x0000000000000000000000000000000000000000' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('CHAINVAULT_VAULT_KEY');
  });

  it('get_transaction returns error for unauthorized chain', async () => {
    const result = await ctxClient.callTool({
      name: 'get_transaction',
      arguments: { chain_id: 1, hash: '0xabc' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('does not have access');
  });

  it('simulate_transaction returns error for unauthorized chain', async () => {
    const result = await ctxClient.callTool({
      name: 'simulate_transaction',
      arguments: {
        chain_id: 1,
        address: '0x0000000000000000000000000000000000000000',
        abi: '[]',
        function_name: 'test',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('does not have access');
  });
});
```

Note: We test rules enforcement and error paths here. Actual RPC calls are tested separately in the existing e2e chain tests. The MCP handler just needs to call `EvmAdapter` correctly.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: FAIL — chain tools still return empty strings.

**Step 3: Implement chain read tools**

Replace the handler functions in `packages/core/src/mcp/tools/chain-tools.ts`. Keep the write tool stubs (`deploy_contract`, `interact_contract`, `verify_contract`) as-is — they're Tier 2.

```typescript
// packages/core/src/mcp/tools/chain-tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';
import { EvmAdapter } from '../../chain/evm-adapter.js';

type ContextGetter = () => AgentContext | null;

function checkChainAccess(ctx: AgentContext | null, chainId: number): string | null {
  if (!ctx) return 'No agent context. Set CHAINVAULT_VAULT_KEY.';
  const result = ctx.rules.checkTxRequest({ type: 'read', chain_id: chainId, value: '0' });
  if (!result.approved) return result.reason ?? `Agent does not have access to chain ${chainId}.`;
  return null;
}

export function registerChainTools(server: McpServer, getContext: ContextGetter): void {
  // --- Tier 2 stubs (write operations) --- keep as-is
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
      return { content: [{ type: 'text' as const, text: 'deploy_contract is not yet implemented. Coming in Tier 2.' }] };
    },
  );

  server.registerTool(
    'interact_contract',
    {
      title: 'Write to Smart Contract',
      description: 'Call a state-changing function on a deployed contract.',
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
      return { content: [{ type: 'text' as const, text: 'interact_contract is not yet implemented. Coming in Tier 2.' }] };
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
      return { content: [{ type: 'text' as const, text: 'verify_contract is not yet implemented. Coming in Tier 2.' }] };
    },
  );

  // --- Tier 1: Read operations ---

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
    async ({ chain_id, address }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const balance = await adapter.getBalance(address);
        return { content: [{ type: 'text' as const, text: JSON.stringify(balance, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
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
    async ({ chain_id, address, abi, function_name, args }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const parsedAbi = JSON.parse(abi);
        const result = await adapter.readContract({
          address,
          abi: parsedAbi,
          functionName: function_name,
          args: args ?? [],
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ result }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
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
    async ({ chain_id, address, abi, function_name, args, value }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const parsedAbi = JSON.parse(abi);
        // Use the agent's address as the simulating account
        const agentKey = ctx!.keys.find((k) => k.chains.includes(chain_id));
        const account = agentKey?.address ?? '0x0000000000000000000000000000000000000000';

        const result = await adapter.simulateTransaction({
          address,
          abi: parsedAbi,
          functionName: function_name,
          args: args ?? [],
          account,
          value,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
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
    async ({ chain_id, address, abi, event_name, from_block, to_block }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const parsedAbi = JSON.parse(abi);
        const events = await adapter.getEvents({
          address,
          abi: parsedAbi,
          eventName: event_name,
          fromBlock: from_block ? BigInt(from_block) : undefined,
          toBlock: to_block ? BigInt(to_block) : undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
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
    async ({ chain_id, hash }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const tx = await adapter.getTransaction(hash);
        return { content: [{ type: 'text' as const, text: JSON.stringify(tx, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/core/src/mcp/tools/chain-tools.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire get_balance, get_contract_state, get_transaction, get_events, simulate_transaction"
```

---

## Task 4: Wire Compiler Tool

**Files:**
- Modify: `packages/core/src/mcp/tools/compiler-tools.ts`
- Modify: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

**Step 1: Write failing test**

Add to `mcp-integration.e2e.test.ts`:

```typescript
describe('compile_contract tool', () => {
  it('compile_contract returns ABI and bytecode on success', async () => {
    // This test will only pass if Docker or local solc is available.
    // If neither, it should return a clear error, not crash.
    const result = await client.callTool({
      name: 'compile_contract',
      arguments: {
        source_code: 'pragma solidity ^0.8.20; contract Hello { function greet() public pure returns (string memory) { return "hi"; } }',
        compiler_version: '0.8.20',
        contract_name: 'Hello',
      },
    });
    const text = (result.content as any)[0].text;
    const parsed = JSON.parse(text);
    // Either success with ABI or error about missing compiler
    if (parsed.error) {
      expect(parsed.error).toContain('compiler');
    } else {
      expect(parsed.abi).toBeDefined();
      expect(parsed.bytecode).toBeDefined();
    }
  });
});
```

**Step 2: Implement compiler tool**

```typescript
// packages/core/src/mcp/tools/compiler-tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compile } from '../../compiler/solidity.js';

export function registerCompilerTools(server: McpServer): void {
  server.registerTool(
    'compile_contract',
    {
      title: 'Compile Solidity Contract',
      description: 'Compile Solidity source code using solc (via Docker or local install). Returns ABI and bytecode.',
      inputSchema: z.object({
        source_code: z.string().describe('Solidity source code'),
        compiler_version: z.string().describe('Solc version (e.g., "0.8.20")'),
        contract_name: z.string().describe('Contract name to extract'),
        optimization: z.boolean().optional().describe('Enable optimizer (default: true)'),
        optimization_runs: z.number().optional().describe('Optimizer runs (default: 200)'),
      }),
    },
    async ({ source_code, compiler_version, contract_name, optimization, optimization_runs }) => {
      try {
        const result = await compile(
          source_code,
          compiler_version,
          contract_name,
          optimization ?? true,
          optimization_runs ?? 200,
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              abi: result.abi,
              bytecode: result.bytecode,
              warnings: result.warnings,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        const msg = e.message || String(e);
        if (msg.includes('docker') || msg.includes('solc') || msg.includes('ENOENT')) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Solidity compiler not available. Run 'chainvault solc pull ${compiler_version}' or install solc locally. Details: ${msg}`,
              }),
            }],
          };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
      }
    },
  );
}
```

**Step 3: Run tests**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Expected: PASS (test handles both success and missing-compiler cases).

**Step 4: Commit**

```bash
git add packages/core/src/mcp/tools/compiler-tools.ts packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "feat(mcp): wire compile_contract to solidity compiler module"
```

---

## Task 5: CLI `solc pull` Command + README Update

**Files:**
- Create: `packages/cli/src/commands/solc.ts`
- Modify: `packages/cli/src/index.ts` (dist version)
- Modify: `README.md`

**Step 1: Implement solc pull command**

```typescript
// packages/cli/src/commands/solc.ts
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

export async function pullSolc(version: string = '0.8.20'): Promise<string> {
  const image = `ethereum/solc:${version}`;
  console.log(`Pulling Docker image: ${image}...`);

  try {
    await execFileAsync('docker', ['pull', image], { timeout: 120000 });
    return `Successfully pulled ${image}. The compile_contract tool is now ready.`;
  } catch (err: any) {
    if (err.message?.includes('ENOENT') || err.message?.includes('not found')) {
      throw new Error('Docker is not installed. Install Docker from https://docker.com or install solc locally.');
    }
    throw new Error(`Failed to pull ${image}: ${err.message}`);
  }
}
```

**Step 2: Wire into CLI entry point**

Add to `packages/cli/src/index.ts` (after the `agent` command block):

```typescript
const solcCmd = program.command('solc').description('Manage Solidity compiler');
solcCmd
  .command('pull [version]')
  .description('Pull solc Docker image for contract compilation')
  .action(async (version) => {
    const { pullSolc } = await import('./commands/solc.js');
    try {
      const result = await pullSolc(version || '0.8.20');
      console.log(result);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });
```

**Step 3: Transpile new files to dist**

Run: `npx esbuild packages/cli/src/commands/solc.ts --format=esm --outdir=packages/cli/dist/commands/`

**Step 4: Update README.md**

Add to the Quick Start section after installation:

```markdown
### Compiler Setup (optional)

To enable Solidity compilation via `compile_contract`:

```bash
# Pull the solc Docker image (default: 0.8.20)
chainvault solc pull

# Or pull a specific version
chainvault solc pull 0.8.26
```

Requires Docker. Alternatively, install `solc` locally.
```

**Step 5: Test the command**

Run: `node packages/cli/dist/index.js solc pull 0.8.20`
Expected: Docker pull output, then success message.

**Step 6: Commit**

```bash
git add packages/cli/src/commands/solc.ts packages/cli/src/index.ts README.md
git commit -m "feat(cli): add 'chainvault solc pull' command for compiler Docker setup"
```

---

## Task 6: Retranspile dist + Final Verification

**Step 1: Transpile all source to dist**

Run:
```bash
find packages/core/src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/core/dist/$(dirname "${f#packages/core/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --outdir="$outdir"
done

find packages/cli/src -name "*.ts" -not -name "*.tsx" ! -name "*.test.ts" ! -name "*.e2e.test.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/cli/dist/$(dirname "${f#packages/cli/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --outdir="$outdir"
done
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 3: Test serve with dev vault**

Run:
```bash
CHAINVAULT_VAULT_KEY=<key-from-dev-vault> node packages/cli/dist/index.js serve -p .chainvault-dev
```
Expected: `ChainVault MCP server running on stdio (agent: <name>)`

**Step 4: Commit dist changes**

```bash
git add packages/core/dist/ packages/cli/dist/
git commit -m "chore: retranspile dist for MCP tool wiring"
```

---

## Task Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Agent context from CHAINVAULT_VAULT_KEY | 4 |
| 2 | Wire vault tools (list_chains, list_capabilities, get_agent_address) | 4 |
| 3 | Wire chain read tools (get_balance, get_contract_state, get_transaction, get_events, simulate_transaction) | 3 |
| 4 | Wire compiler tool (compile_contract) | 1 |
| 5 | CLI `solc pull` command + README | 0 (manual test) |
| 6 | Retranspile dist + verification | 0 (integration) |

**Total: ~12 new tests, 6 tasks**
