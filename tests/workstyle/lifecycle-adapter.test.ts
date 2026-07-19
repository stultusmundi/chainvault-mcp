import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvmAdapter } from '@chainvault/core';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';

const ready = anvilAvailable() && (await compilerAvailable());
const SUPPLY = 1_000_000n * 10n ** 18n;

describe.skipIf(!ready)('EvmAdapter lifecycle on anvil', () => {
  let anvil: AnvilHarness;
  let adapter: EvmAdapter;

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
    adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('deploys TestToken with constructor args and reads state back', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const result = await adapter.deployContract({
      abi,
      bytecode,
      args: ['Workstyle', 'WORK', SUPPLY],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const total = await adapter.readContract({
      address: result.address!, abi, functionName: 'totalSupply', args: [],
    });
    expect(total).toBe(SUPPLY);
  });

  it('write -> event -> receipt round trip', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    const { address } = await adapter.deployContract({
      abi, bytecode, args: ['Workstyle', 'WORK', SUPPLY],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });

    const write = await adapter.writeContract({
      address: address!, abi, functionName: 'transfer',
      args: [ANVIL_ACCOUNTS[1].address, 500n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    expect(write.hash).toMatch(/^0x/);

    const tx = await adapter.getTransaction(write.hash);
    expect(tx.receipt.status).toBe('success');

    const events = await adapter.getEvents({
      address: address!, abi, eventName: 'Transfer', fromBlock: 0n,
    });
    // constructor mint + our transfer
    expect(events.length).toBeGreaterThanOrEqual(2);

    const balance = await adapter.readContract({
      address: address!, abi, functionName: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(balance).toBe(500n);
  });

  it('factory deploy creates readable children', async () => {
    const factory = await compileCorpusContract('Factory', 'Factory');
    const child = await compileCorpusContract('Factory', 'Child');
    const { address } = await adapter.deployContract({
      abi: factory.abi, bytecode: factory.bytecode, args: [],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    await adapter.writeContract({
      address: address!, abi: factory.abi, functionName: 'createChild', args: [7n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    const childAddr = await adapter.readContract({
      address: address!, abi: factory.abi, functionName: 'children', args: [0n],
    });
    const value = await adapter.readContract({
      address: childAddr as string, abi: child.abi, functionName: 'value', args: [],
    });
    expect(value).toBe(7n);
  });

  it('proxy upgrade switches implementation behavior', async () => {
    const proxy = await compileCorpusContract('Counter', 'CounterProxy');
    const v1 = await compileCorpusContract('Counter', 'CounterV1');
    const v2 = await compileCorpusContract('Counter', 'CounterV2');
    const pk = ANVIL_ACCOUNTS[0].privateKey;

    const v1Deploy = await adapter.deployContract({ abi: v1.abi, bytecode: v1.bytecode, args: [], privateKey: pk });
    const v2Deploy = await adapter.deployContract({ abi: v2.abi, bytecode: v2.bytecode, args: [], privateKey: pk });
    const proxyDeploy = await adapter.deployContract({
      abi: proxy.abi, bytecode: proxy.bytecode, args: [v1Deploy.address!], privateKey: pk,
    });
    const at = proxyDeploy.address!;

    await adapter.writeContract({ address: at, abi: v1.abi, functionName: 'increment', args: [], privateKey: pk });
    expect(await adapter.readContract({ address: at, abi: v1.abi, functionName: 'count', args: [] })).toBe(1n);

    await adapter.writeContract({ address: at, abi: v1.abi, functionName: 'upgradeTo', args: [v2Deploy.address!], privateKey: pk });
    await adapter.writeContract({ address: at, abi: v2.abi, functionName: 'increment', args: [], privateKey: pk });
    expect(await adapter.readContract({ address: at, abi: v2.abi, functionName: 'count', args: [] })).toBe(3n);
    expect(await adapter.readContract({ address: at, abi: v2.abi, functionName: 'version', args: [] })).toBe(2n);
  });

  it('estimateGas returns sane values for a plain transfer', async () => {
    const estimate = await adapter.estimateGas({
      to: ANVIL_ACCOUNTS[1].address, value: '1000000000000000000',
    });
    expect(BigInt(estimate.gasLimit)).toBeGreaterThanOrEqual(21_000n);
    expect(Number(estimate.estimatedCostEth)).toBeGreaterThan(0);
  });

  it('simulateTransaction predicts a revert without spending', async () => {
    const { abi, bytecode } = await compileCorpusContract('Reverter');
    const { address } = await adapter.deployContract({
      abi, bytecode, args: [], privateKey: ANVIL_ACCOUNTS[0].privateKey,
    });
    const sim = await adapter.simulateTransaction({
      address: address!, abi, functionName: 'failRequire', args: [],
      account: ANVIL_ACCOUNTS[0].address,
    });
    expect(sim.success).toBe(false);
    expect(sim.error).toContain('require failed as requested');
  });
});
