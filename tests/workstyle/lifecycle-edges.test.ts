import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('MCP edge cases on anvil', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
  });

  afterAll(async () => {
    await mcp.close();
  });

  async function deployMcp(file: string, name: string, args: unknown[] = []): Promise<{ address: string; abi: string }> {
    const { abi, bytecode } = await compileCorpusContract(file, name);
    const result = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: JSON.stringify(abi), bytecode, constructor_args: args,
    });
    return { address: result.contractAddress, abi: JSON.stringify(abi) };
  }

  it('payable interact_contract sends native value (value is ETH-denominated)', async () => {
    const vault = await deployMcp('PayableVault', 'PayableVault');
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vault.address, abi: vault.abi,
      function_name: 'deposit', args: [], value: '0.5',
    });
    const deposit = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vault.address, abi: vault.abi,
      function_name: 'deposits', args: [ANVIL_ACCOUNTS[0].address],
    });
    expect(JSON.stringify(deposit)).toContain('500000000000000000'); // 0.5 ETH in wei
  });

  it('revert reasons surface sanitized — no key material, no internals', async () => {
    const reverter = await deployMcp('Reverter', 'Reverter');
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failRequire', args: [],
    });
    expect(text).toContain('require failed as requested');
    expect(text).not.toMatch(/0x[a-fA-F0-9]{64}/); // no 32-byte hex (keys/raw data)
    expect(text).not.toContain(ANVIL_ACCOUNTS[0].privateKey.slice(2));
  });

  it('simulate/write parity: simulate predicts the revert the write produces', async () => {
    const reverter = await deployMcp('Reverter', 'Reverter');
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failCustomError', args: [],
    });
    expect(sim.success).toBe(false);
    const writeText = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverter.address, abi: reverter.abi,
      function_name: 'failCustomError', args: [],
    });
    expect(writeText).toContain('Error');
  });

  it('sequential writes advance nonces cleanly', async () => {
    const storm = await deployMcp('EventStorm', 'EventStorm');
    for (let i = 0; i < 3; i++) {
      const result = await callToolJson(mcp.client, 'interact_contract', {
        chain_id: ANVIL_CHAIN_ID, address: storm.address, abi: storm.abi,
        function_name: 'emitMany', args: ['5'],
      });
      expect(result.hash).toMatch(/^0x/);
    }
    const events = await callToolJson(mcp.client, 'get_events', {
      chain_id: ANVIL_CHAIN_ID, address: storm.address, abi: storm.abi,
      event_name: 'Ping', from_block: 0,
    });
    const count = Array.isArray(events) ? events.length : events.count;
    expect(count).toBe(15);
  });

  it('gas-heavy write completes and reports gas in the receipt', async () => {
    const hog = await deployMcp('GasHog', 'GasHog');
    const result = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: hog.address, abi: hog.abi,
      function_name: 'waste', args: ['50'],
    });
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: ANVIL_CHAIN_ID, hash: result.hash,
    });
    expect(BigInt(tx.receipt.gasUsed)).toBeGreaterThan(100_000n);
  });
});
