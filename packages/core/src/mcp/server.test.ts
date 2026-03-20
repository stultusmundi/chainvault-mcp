import { describe, it, expect } from 'vitest';
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

    // Compiler tools
    expect(toolNames).toContain('compile_contract');

    // Chain registry tools
    expect(toolNames).toContain('list_supported_chains');
    expect(toolNames).toContain('request_faucet');
  });
});
