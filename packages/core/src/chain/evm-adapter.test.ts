import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvmAdapter } from './evm-adapter.js';
import type { ChainAdapter } from './types.js';

// We mock viem to avoid needing a real RPC
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: vi.fn(async () => 1000000000000000000n), // 1 ETH
      readContract: vi.fn(async () => 'MockResult'),
      simulateContract: vi.fn(async () => ({ result: true })),
      getContractEvents: vi.fn(async () => [
        { eventName: 'Transfer', args: { from: '0x1', to: '0x2', value: 100n } },
      ]),
      getTransaction: vi.fn(async () => ({
        hash: '0xabc',
        from: '0x1',
        to: '0x2',
        value: 0n,
        blockNumber: 1000n,
      })),
      getTransactionReceipt: vi.fn(async () => ({
        status: 'success',
        gasUsed: 21000n,
      })),
      estimateGas: vi.fn(async () => 21000n),
      getGasPrice: vi.fn(async () => 30000000000n),
    })),
    http: vi.fn(() => 'http-transport'),
  };
});

describe('EvmAdapter - Read Operations', () => {
  let adapter: ChainAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('gets balance', async () => {
    const result = await adapter.getBalance('0x1234567890abcdef1234567890abcdef12345678');
    expect(result).toBeDefined();
    expect(result.wei).toBe('1000000000000000000');
    expect(result.formatted).toBe('1');
  });

  it('reads contract state', async () => {
    const result = await adapter.readContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'totalSupply',
      args: [],
    });
    expect(result).toBe('MockResult');
  });

  it('simulates a transaction', async () => {
    const result = await adapter.simulateTransaction({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      account: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(result.success).toBe(true);
  });

  it('gets contract events', async () => {
    const result = await adapter.getEvents({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ name: 'Transfer', type: 'event', inputs: [] }],
      eventName: 'Transfer',
    });
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe('Transfer');
  });

  it('gets transaction details', async () => {
    const result = await adapter.getTransaction('0xabc');
    expect(result.hash).toBe('0xabc');
    expect(result.receipt.status).toBe('success');
  });

  it('estimates gas cost', async () => {
    const estimate = await adapter.estimateGas({
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '0',
    });
    expect(estimate.gasLimit).toBeDefined();
    expect(estimate.gasPriceGwei).toBeDefined();
    expect(estimate.estimatedCostEth).toBeDefined();
  });
});
