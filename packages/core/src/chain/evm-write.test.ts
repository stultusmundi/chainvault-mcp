import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvmAdapter } from './evm-adapter.js';

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'success',
        contractAddress: '0xNewContractAddress',
      })),
    })),
    createWalletClient: vi.fn(() => ({
      deployContract: vi.fn(async () => '0xDeployTxHash'),
      writeContract: vi.fn(async () => '0xWriteTxHash'),
    })),
    http: vi.fn(() => 'http-transport'),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  })),
}));

describe('EvmAdapter - Write Operations', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('deploys a contract and returns hash', async () => {
    const result = await adapter.deployContract({
      abi: [{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' }],
      bytecode: '0x608060405260405161083e',
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });
    expect(result.hash).toBe('0xDeployTxHash');
  });

  it('writes to a contract and returns hash', async () => {
    const result = await adapter.writeContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });
    expect(result.hash).toBe('0xWriteTxHash');
  });

  it('wipes private key from params after deploy', async () => {
    const params = {
      abi: [{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' }],
      bytecode: '0x608060405260405161083e',
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    };
    await adapter.deployContract(params);
    expect(params.privateKey).toBe('');
  });

  it('wipes private key from params after writeContract', async () => {
    const params = {
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    };
    await adapter.writeContract(params);
    expect(params.privateKey).toBe('');
  });
});

describe('EvmAdapter - writeContract value forwarding (wei)', () => {
  // Same wei-denominated boundary contract as estimateGas/simulateTransaction:
  // the MCP handler (interact_contract, see chain-tools.ts) converts the
  // agent-facing ETH value to wei via parseEther before calling
  // writeContract. The adapter must forward that wei string as a BigInt,
  // not re-run parseEther on it (which would scale it by 1e18 again).
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('https://rpc.example.com', 11155111);
  });

  it('forwards a wei value to walletClient.writeContract as a BigInt', async () => {
    const result = await adapter.writeContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'payable', type: 'function' }],
      functionName: 'mint',
      args: [],
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      value: '500000000000000000', // 0.5 ETH in wei
    });
    expect(result.hash).toBe('0xWriteTxHash');

    const { createWalletClient } = await import('viem');
    const mockWalletClient = (createWalletClient as any).mock.results.at(-1).value;
    expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ value: 500000000000000000n }),
    );
  });

  it('passes undefined value when none given', async () => {
    await adapter.writeContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [{ inputs: [], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
      functionName: 'mint',
      args: [],
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });

    const { createWalletClient } = await import('viem');
    const mockWalletClient = (createWalletClient as any).mock.results.at(-1).value;
    expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ value: undefined }),
    );
  });
});
