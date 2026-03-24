import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainVaultServer } from './server.js';
import { SUPPORTED_CHAINS } from '../chain/chains.js';

describe('MCP Server Integration (in-process via InMemoryTransport)', () => {
  let client: Client;
  let serverInstance: ChainVaultServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    serverInstance = new ChainVaultServer({ basePath: '/tmp/chainvault-mcp-test' });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });

    await serverInstance.getMcpServer().connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await serverInstance.getMcpServer().close();
  });

  // -----------------------------------------------------------------------
  // Tool discovery
  // -----------------------------------------------------------------------
  describe('Tool discovery', () => {
    it('listTools returns a non-empty array of tools', async () => {
      const result = await client.listTools();
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('every tool has name, description, and inputSchema', async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);

        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');

        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('contains chain registry tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('list_supported_chains');
      expect(names).toContain('request_faucet');
    });

    it('contains compiler tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('compile_contract');
    });

    it('contains vault tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('list_chains');
      expect(names).toContain('list_capabilities');
      expect(names).toContain('get_agent_address');
    });

    it('contains chain tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('deploy_contract');
      expect(names).toContain('interact_contract');
      expect(names).toContain('get_balance');
      expect(names).toContain('get_contract_state');
      expect(names).toContain('simulate_transaction');
      expect(names).toContain('get_events');
      expect(names).toContain('get_transaction');
      expect(names).toContain('verify_contract');
    });

    it('contains proxy tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('query_explorer');
      expect(names).toContain('query_price');
    });

    it('total registered tool count matches server tracking', async () => {
      const { tools } = await client.listTools();
      const serverNames = serverInstance.getRegisteredToolNames();
      expect(tools.length).toBe(serverNames.length);
    });
  });

  // -----------------------------------------------------------------------
  // list_supported_chains tool
  // -----------------------------------------------------------------------
  describe('list_supported_chains tool', () => {
    it('returns all chains when called with no filter', async () => {
      const result = await client.callTool({ name: 'list_supported_chains', arguments: {} });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('text');

      const chains = JSON.parse(content[0].text);
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBe(SUPPORTED_CHAINS.length);
      expect(chains.length).toBeGreaterThanOrEqual(14);
    });

    it('filters to mainnet chains only', async () => {
      const result = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'mainnet' },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const chains = JSON.parse(content[0].text);

      expect(chains.length).toBeGreaterThan(0);
      for (const chain of chains) {
        expect(chain.network).toBe('mainnet');
      }
    });

    it('filters to testnet chains only', async () => {
      const result = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'testnet' },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const chains = JSON.parse(content[0].text);

      expect(chains.length).toBeGreaterThan(0);
      for (const chain of chains) {
        expect(chain.network).toBe('testnet');
      }
    });

    it('each chain entry has the expected fields', async () => {
      const result = await client.callTool({ name: 'list_supported_chains', arguments: {} });
      const content = result.content as Array<{ type: string; text: string }>;
      const chains = JSON.parse(content[0].text);

      for (const chain of chains) {
        expect(chain).toHaveProperty('chainId');
        expect(typeof chain.chainId).toBe('number');

        expect(chain).toHaveProperty('name');
        expect(typeof chain.name).toBe('string');

        expect(chain).toHaveProperty('nativeCurrency');
        expect(typeof chain.nativeCurrency).toBe('string');

        expect(chain).toHaveProperty('hasWebSocket');
        expect(typeof chain.hasWebSocket).toBe('boolean');

        expect(chain).toHaveProperty('hasFaucet');
        expect(typeof chain.hasFaucet).toBe('boolean');

        expect(chain).toHaveProperty('blockExplorer');
      }
    });

    it('mainnet + testnet counts equal total', async () => {
      const allResult = await client.callTool({
        name: 'list_supported_chains',
        arguments: {},
      });
      const mainnetResult = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'mainnet' },
      });
      const testnetResult = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'testnet' },
      });

      const allContent = allResult.content as Array<{ type: string; text: string }>;
      const mainnetContent = mainnetResult.content as Array<{ type: string; text: string }>;
      const testnetContent = testnetResult.content as Array<{ type: string; text: string }>;

      const allChains = JSON.parse(allContent[0].text);
      const mainnetChains = JSON.parse(mainnetContent[0].text);
      const testnetChains = JSON.parse(testnetContent[0].text);

      expect(mainnetChains.length + testnetChains.length).toBe(allChains.length);
    });
  });

  // -----------------------------------------------------------------------
  // request_faucet tool
  // -----------------------------------------------------------------------
  describe('request_faucet tool', () => {
    const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

    it('returns result with correct chainId for a testnet chain', async () => {
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 11155111, address: TEST_ADDRESS },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.chainId).toBe(11155111);
      expect(parsed.chainName).toBe('Sepolia');
    });

    it('returns success=false for a mainnet chain', async () => {
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 1, address: TEST_ADDRESS },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.message.toLowerCase()).toContain('mainnet');
    });

    it('returns success=false for an unknown chain', async () => {
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 999999, address: TEST_ADDRESS },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // compile_contract tool
  // -----------------------------------------------------------------------
  describe('compile_contract tool', () => {
    it('compile_contract returns structured result or compiler-not-found error', { timeout: 30000 }, async () => {
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
      // Either success with ABI or error about missing compiler — both are valid
      if (parsed.error) {
        expect(parsed.error).toMatch(/compiler|solc|docker/i);
      } else {
        expect(parsed.abi).toBeDefined();
        expect(Array.isArray(parsed.abi)).toBe(true);
        expect(parsed.bytecode).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Stub tools return without error
  // -----------------------------------------------------------------------
  describe('Stub tools return without error', () => {
    it('get_balance returns content', async () => {
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { chain_id: 1, address: '0x0000000000000000000000000000000000000000' },
      });
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('list_chains returns content', async () => {
      const result = await client.callTool({
        name: 'list_chains',
        arguments: {},
      });
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('simulate_transaction returns content', async () => {
      const result = await client.callTool({
        name: 'simulate_transaction',
        arguments: {
          chain_id: 1,
          address: '0x0000000000000000000000000000000000000000',
          abi: '[]',
          function_name: 'test',
        },
      });
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('list_capabilities returns content', async () => {
      const result = await client.callTool({
        name: 'list_capabilities',
        arguments: {},
      });
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('query_explorer returns content', async () => {
      const result = await client.callTool({
        name: 'query_explorer',
        arguments: {
          chain_id: 1,
          module: 'contract',
          action: 'getabi',
        },
      });
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Vault tools (with agent context)
  // -----------------------------------------------------------------------
  describe('Vault tools (with agent context)', () => {
    let ctxClient: Client;
    let ctxServer: ChainVaultServer;
    let testDir: string;

    beforeAll(async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const { MasterVault } = await import('../vault/master-vault.js');
      const { AgentVaultManager } = await import('../vault/agent-vault.js');

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

    it('list_chains returns agent allowed chains with metadata', async () => {
      const result = await ctxClient.callTool({ name: 'list_chains', arguments: {} });
      const text = (result.content as any)[0].text;
      const chains = JSON.parse(text);
      expect(chains).toContainEqual(expect.objectContaining({ chainId: 11155111 }));
      // Chain 1 is NOT in agent config even though the key supports it
      expect(chains.find((c: any) => c.chainId === 1)).toBeUndefined();
    });

    it('list_capabilities returns agent rules summary', async () => {
      const result = await ctxClient.callTool({ name: 'list_capabilities', arguments: {} });
      const text = (result.content as any)[0].text;
      const caps = JSON.parse(text);
      expect(caps.agent).toBe('tester');
      expect(caps.allowed_types).toEqual(['read', 'simulate']);
      expect(caps.chains).toEqual([11155111]);
    });

    it('get_agent_address returns public address for allowed chain', async () => {
      const result = await ctxClient.callTool({ name: 'get_agent_address', arguments: { chain_id: 11155111 } });
      const text = (result.content as any)[0].text;
      expect(text).toMatch(/^0x[a-fA-F0-9]{40}$/);
      // Must NOT contain private key material
      expect(text.toLowerCase()).not.toContain('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    });

    it('get_agent_address returns error for unauthorized chain', async () => {
      const result = await ctxClient.callTool({ name: 'get_agent_address', arguments: { chain_id: 1 } });
      const text = (result.content as any)[0].text;
      expect(text).toContain('does not have access');
    });

    // -----------------------------------------------------------------
    // Chain read tools
    // -----------------------------------------------------------------
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

      it('get_events returns error for unauthorized chain', async () => {
        const result = await ctxClient.callTool({
          name: 'get_events',
          arguments: {
            chain_id: 1,
            address: '0x0000000000000000000000000000000000000000',
            abi: '[]',
            event_name: 'Transfer',
          },
        });
        const text = (result.content as any)[0].text;
        expect(text).toContain('does not have access');
      });

      it('get_contract_state returns error for unauthorized chain', async () => {
        const result = await ctxClient.callTool({
          name: 'get_contract_state',
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

    // -----------------------------------------------------------------
    // Chain write tools (rules enforcement)
    // -----------------------------------------------------------------
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

      it('verify_contract returns error when no API key configured', async () => {
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
        // Agent has no API keys configured, so this should fail gracefully
        expect(text).toMatch(/no.*api.*key|not configured/i);
      });
    });
  });
});
