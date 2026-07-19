import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicClient } from 'viem';
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
    webSocket: vi.fn(() => 'ws-transport'),
    fallback: vi.fn((...args: any[]) => 'fallback-transport'),
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

  it('forwards value in wei to simulateContract for payable calls', async () => {
    await adapter.simulateTransaction({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'deposit', outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: 'deposit',
      args: [],
      account: '0x1234567890abcdef1234567890abcdef12345678',
      value: '500000000000000000', // 0.5 ETH in wei
    });

    const client = vi.mocked(createPublicClient).mock.results.at(-1)!.value;
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ value: 500000000000000000n }),
    );
  });

  it('passes undefined value to simulateContract when no value given', async () => {
    await adapter.simulateTransaction({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      account: '0x1234567890abcdef1234567890abcdef12345678',
    });

    const client = vi.mocked(createPublicClient).mock.results.at(-1)!.value;
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ value: undefined }),
    );
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

describe('EvmAdapter.fromChainId', () => {
  it('creates adapter for a known chain', () => {
    const adapter = EvmAdapter.fromChainId(1);
    expect(adapter.chainId).toBe(1);
    expect(adapter.getChainInfo()).toBeDefined();
    expect(adapter.getChainInfo()!.name).toBe('Ethereum Mainnet');
  });

  it('creates adapter for Sepolia testnet', () => {
    const adapter = EvmAdapter.fromChainId(11155111);
    expect(adapter.chainId).toBe(11155111);
    expect(adapter.getChainInfo()!.network).toBe('testnet');
  });

  it('throws for unknown chain without custom RPC', () => {
    expect(() => EvmAdapter.fromChainId(999999)).toThrow('not in the supported chain registry');
  });

  it('uses custom RPC URL when provided', () => {
    const adapter = EvmAdapter.fromChainId(999999, 'https://custom-rpc.example.com');
    expect(adapter.chainId).toBe(999999);
  });

  it('custom RPC overrides registry for known chain', () => {
    const adapter = EvmAdapter.fromChainId(1, 'https://my-private-rpc.com');
    expect(adapter.chainId).toBe(1);
    expect(adapter.getChainInfo()).toBeDefined();
  });

  it('uses fallback transport for registry chains with WebSocket', async () => {
    const { fallback: fallbackFn } = await import('viem');
    const adapter = EvmAdapter.fromChainId(1);
    // fallback should have been called since Ethereum has WS URLs
    expect(fallbackFn).toHaveBeenCalled();
  });
});

describe('EvmAdapter - estimateGas value forwarding (wei)', () => {
  // ChainAdapter is a wei-denominated boundary end-to-end (same contract as
  // simulateTransaction/writeContract above): callers convert ETH -> wei
  // with parseEther at the MCP handler layer (see chain-tools.ts), and the
  // adapter forwards the wei string as a BigInt. estimateGas must follow the
  // same contract — it must NOT re-run parseEther on an already-wei value,
  // which would silently multiply the amount by 1e18.
  let adapter: ChainAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('forwards a wei value to client.estimateGas as a BigInt', async () => {
    await adapter.estimateGas({
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '500000000000000000', // 0.5 ETH in wei
    });

    const { createPublicClient } = await import('viem');
    const mockClient = (createPublicClient as any).mock.results.at(-1).value;
    expect(mockClient.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 500000000000000000n }),
    );
  });

  it('defaults to 0n when no value is given', async () => {
    await adapter.estimateGas({
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '',
    });

    const { createPublicClient } = await import('viem');
    const mockClient = (createPublicClient as any).mock.results.at(-1).value;
    expect(mockClient.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 0n }),
    );
  });

  it('does not crash and does not silently scale an already-wei value (regression for #18)', async () => {
    // A decimal *ETH* string reaching this method would previously crash
    // BigInt('0.5'); it must never be handed a decimal string in the first
    // place because callers convert to wei first. Guard the contract here:
    // an integer wei string must round-trip byte-for-byte, not get
    // multiplied by 1e18 the way `parseEther` would.
    await adapter.estimateGas({
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '1000000000000000000', // 1 ETH, already in wei
    });

    const { createPublicClient } = await import('viem');
    const mockClient = (createPublicClient as any).mock.results.at(-1).value;
    expect(mockClient.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1000000000000000000n }),
    );
  });
});
