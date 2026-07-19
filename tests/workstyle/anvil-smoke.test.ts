import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvmAdapter } from '@chainvault/core';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';

describe.skipIf(!anvilAvailable())('AnvilHarness smoke', () => {
  let anvil: AnvilHarness;

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('reports the configured chain id', async () => {
    const chainIdHex = await anvil.rpc<string>('eth_chainId');
    expect(parseInt(chainIdHex, 16)).toBe(ANVIL_CHAIN_ID);
  });

  it('EvmAdapter reads a funded default account balance', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const balance = await adapter.getBalance(ANVIL_ACCOUNTS[0].address);
    expect(BigInt(balance.wei)).toBe(10_000n * 10n ** 18n); // anvil default: 10,000 ETH
  });

  it('setBalance takes effect', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    await anvil.setBalance('0x00000000000000000000000000000000000000AA', 5n * 10n ** 18n);
    const balance = await adapter.getBalance('0x00000000000000000000000000000000000000AA');
    expect(balance.formatted).toBe('5');
  });

  it('snapshot/revert round-trips state', async () => {
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const snap = await anvil.snapshot();
    await anvil.setBalance('0x00000000000000000000000000000000000000BB', 1n * 10n ** 18n);
    await anvil.revert(snap);
    const balance = await adapter.getBalance('0x00000000000000000000000000000000000000BB');
    expect(balance.wei).toBe('0');
  });
});
