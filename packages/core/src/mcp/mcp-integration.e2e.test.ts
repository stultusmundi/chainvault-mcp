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
});
