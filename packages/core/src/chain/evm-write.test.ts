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
