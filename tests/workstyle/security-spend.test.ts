import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anvilAvailable, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, connectMcp, callToolJson, callToolText, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('spend limits with real transactions', () => {
  let mcp: WorkstyleMcp;
  let vaultAddress: string;
  let vaultAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp({
      agents: [{
        name: 'limited',
        limits: {
          '31337': { max_per_tx: '1.0', daily_limit: '2.5', monthly_limit: '100' },
        },
      }],
    });
    const { abi, bytecode } = await compileCorpusContract('PayableVault');
    vaultAbi = JSON.stringify(abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: vaultAbi, bytecode, constructor_args: [],
    });
    vaultAddress = deploy.contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  function deposit(value: string) {
    return callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposit', args: [], value,
    });
  }

  it('denies a tx over the per-tx limit — and no tx lands on chain', async () => {
    const before = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposits', args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    const text = await deposit('1.5');
    expect(text.toLowerCase()).toContain('per-tx limit');
    const after = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposits', args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('allows at-limit txs, then denies when daily accumulation would exceed', async () => {
    expect(await deposit('0.9')).toContain('hash');   // total 0.9
    expect(await deposit('0.9')).toContain('hash');   // total 1.8
    const denied = await deposit('0.9');               // 2.7 > 2.5
    expect(denied.toLowerCase()).toContain('daily limit');
  });

  it('spend accumulation survives a server restart (SQLite persistence)', async () => {
    // Simulate `chainvault serve` restart: new server process state, same vault dir + anvil
    await mcp.client.close();
    await mcp.server.getMcpServer().close();
    const reconnected = await connectMcp(mcp.anvil, mcp.fixture, 'limited');
    // Swap handles so afterAll closes the live one (fixture/anvil shared)
    mcp.client = reconnected.client;
    mcp.server = reconnected.server;

    const denied = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: vaultAbi,
      function_name: 'deposit', args: [], value: '0.9',
    });
    expect(denied.toLowerCase()).toContain('daily limit'); // 1.8 already spent pre-restart
  });
});
