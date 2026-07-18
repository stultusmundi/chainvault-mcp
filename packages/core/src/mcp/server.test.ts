import { describe, it, expect } from 'vitest';
import { ChainVaultServer } from './server.js';
import { toJson } from './tools/chain-tools.js';

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

describe('toJson', () => {
  // JSON.stringify throws on plain bigint — viem returns bigint for uint/int
  // ABI types (contract reads, simulation results, event args). Tool
  // responses must serialize those without crashing.
  it('serializes a top-level bigint field as a decimal string', () => {
    const text = toJson({ result: 12345n });
    expect(JSON.parse(text)).toEqual({ result: '12345' });
  });

  it('serializes bigints nested inside arrays and objects (event logs)', () => {
    const events = [
      { eventName: 'Transfer', args: { from: '0x1', to: '0x2', value: 500n }, blockNumber: 42n },
    ];
    const text = toJson(events);
    const parsed = JSON.parse(text);
    expect(parsed[0].args.value).toBe('500');
    expect(parsed[0].blockNumber).toBe('42');
  });

  it('leaves non-bigint values untouched', () => {
    const text = toJson({ success: true, result: 'WORK', count: 3 });
    expect(JSON.parse(text)).toEqual({ success: true, result: 'WORK', count: 3 });
  });

  it('round-trips a plain JSON.stringify call for values with no bigint', () => {
    const value = { a: 1, b: 'two', c: [1, 2, 3] };
    expect(toJson(value)).toBe(JSON.stringify(value, null, 2));
  });
});
