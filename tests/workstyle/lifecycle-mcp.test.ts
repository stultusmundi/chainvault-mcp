import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());
const SUPPLY = '1000000000000000000000000'; // 1M tokens as decimal string (JSON-safe)

describe.skipIf(!ready)('MCP tool lifecycle on anvil', () => {
  let mcp: WorkstyleMcp;
  let tokenAddress: string;
  let tokenAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    tokenAbi = JSON.stringify(abi);

    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID,
      abi: tokenAbi,
      bytecode,
      constructor_args: ['Workstyle', 'WORK', SUPPLY],
    });
    expect(deploy.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    tokenAddress = deploy.contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  it('get_agent_address matches the funded anvil key', async () => {
    const text = await callToolText(mcp.client, 'get_agent_address', { chain_id: ANVIL_CHAIN_ID });
    expect(text.toLowerCase()).toContain(ANVIL_ACCOUNTS[0].address.toLowerCase());
  });

  it('get_balance reads native balance through the vault RPC', async () => {
    const result = await callToolJson(mcp.client, 'get_balance', {
      chain_id: ANVIL_CHAIN_ID, address: ANVIL_ACCOUNTS[0].address,
    });
    expect(BigInt(result.wei)).toBeGreaterThan(0n);
  });

  it('get_contract_state reads deployed token state', async () => {
    const result = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'symbol', args: [],
    });
    expect(JSON.stringify(result)).toContain('WORK');
  });

  it('interact_contract transfers and get_events sees it', async () => {
    const write = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '12345'],
    });
    expect(write.hash).toMatch(/^0x/);

    const balance = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(balance)).toContain('12345');

    const events = await callToolJson(mcp.client, 'get_events', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      event_name: 'Transfer', from_block: 0,
    });
    expect(Array.isArray(events) ? events.length : events.count).toBeTruthy();
  });

  it('simulate_transaction succeeds for a valid call', async () => {
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[2].address, '1'],
    });
    expect(sim.success).toBe(true);
  });

  it('get_transaction returns a receipt for the deploy', async () => {
    // Redeploy to capture a fresh hash deterministically
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: JSON.stringify(abi), bytecode,
      constructor_args: ['Two', 'TWO', '1000'],
    });
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: ANVIL_CHAIN_ID, hash: deploy.hash,
    });
    expect(tx.receipt.status).toBe('success');
  });
});
