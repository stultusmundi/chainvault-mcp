import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerChainTools, sanitizeError } from './chain-tools.js';
import type { AgentContext } from '../context.js';

const writeContractMock = vi.fn(async () => ({ hash: '0xWriteTxHash' }));
const simulateTransactionMock = vi.fn(async () => ({ success: true, result: null }));

vi.mock('../../chain/evm-adapter.js', () => ({
  EvmAdapter: {
    fromChainId: vi.fn(() => ({
      writeContract: writeContractMock,
      simulateTransaction: simulateTransactionMock,
    })),
  },
}));

/** Minimal McpServer double — captures registered tool handlers by name. */
function createFakeServer() {
  const handlers = new Map<string, (args: any) => Promise<any>>();
  return {
    handlers,
    registerTool: (name: string, _config: unknown, handler: (args: any) => Promise<any>) => {
      handlers.set(name, handler);
    },
  };
}

function createApprovedContext(): AgentContext {
  return {
    agentName: 'test-agent',
    config: {} as AgentContext['config'],
    rules: {
      checkTxRequest: () => ({ approved: true }),
      recordSpend: vi.fn(),
    } as unknown as AgentContext['rules'],
    keys: [{ name: 'k', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', chains: [11155111] }],
    getPrivateKeyForChain: () => '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    getApiKey: () => null,
    getApiKeyForExplorer: () => null,
    getRpcUrlForChain: () => null,
  };
}

describe('interact_contract value conversion', () => {
  beforeEach(() => {
    writeContractMock.mockClear();
  });

  it('converts ETH-denominated value to wei before calling the adapter', async () => {
    const server = createFakeServer();
    const ctx = createApprovedContext();
    registerChainTools(server as any, () => ctx);

    const handler = server.handlers.get('interact_contract')!;
    await handler({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: '[]',
      function_name: 'deposit',
      args: [],
      value: '0.5',
    });

    expect(writeContractMock).toHaveBeenCalledTimes(1);
    const callArgs = writeContractMock.mock.calls[0][0];
    expect(callArgs.value).toBe('500000000000000000');
  });

  it('passes undefined value through when no value is given', async () => {
    const server = createFakeServer();
    const ctx = createApprovedContext();
    registerChainTools(server as any, () => ctx);

    const handler = server.handlers.get('interact_contract')!;
    await handler({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: '[]',
      function_name: 'increment',
      args: [],
    });

    expect(writeContractMock).toHaveBeenCalledTimes(1);
    const callArgs = writeContractMock.mock.calls[0][0];
    expect(callArgs.value).toBeUndefined();
  });
});

describe('simulate_transaction value conversion', () => {
  beforeEach(() => {
    simulateTransactionMock.mockClear();
  });

  it('converts ETH-denominated value to wei before calling the adapter', async () => {
    const server = createFakeServer();
    const ctx = createApprovedContext();
    registerChainTools(server as any, () => ctx);

    const handler = server.handlers.get('simulate_transaction')!;
    await handler({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: '[]',
      function_name: 'deposit',
      args: [],
      value: '0.5',
    });

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
    const callArgs = simulateTransactionMock.mock.calls[0][0];
    expect(callArgs.value).toBe('500000000000000000');
  });

  it('passes undefined value through when no value is given', async () => {
    const server = createFakeServer();
    const ctx = createApprovedContext();
    registerChainTools(server as any, () => ctx);

    const handler = server.handlers.get('simulate_transaction')!;
    await handler({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: '[]',
      function_name: 'increment',
      args: [],
    });

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
    const callArgs = simulateTransactionMock.mock.calls[0][0];
    expect(callArgs.value).toBeUndefined();
  });
});

describe('sanitizeError', () => {
  it('redacts private keys and URLs (including embedded credentials) from error messages', () => {
    const err = new Error(
      'HTTP request failed.\n\nURL: https://mainnet.infura.io/v3/SECRETKEY123 something 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    const sanitized = sanitizeError(err);
    expect(sanitized).not.toContain('SECRETKEY123');
    expect(sanitized).not.toContain('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    expect(sanitized).toContain('https://[REDACTED]');
    expect(sanitized).toContain('0x[REDACTED]');
  });

  it('redacts a bare (non-Error) string message the same way', () => {
    const sanitized = sanitizeError('fetch failed for http://127.0.0.1:9/v3/SUPERSECRETRPCTOKEN');
    expect(sanitized).not.toContain('SUPERSECRETRPCTOKEN');
    expect(sanitized).toContain('https://[REDACTED]');
  });

  it('redacts non-http schemes like wss:// from error messages', () => {
    const err = new Error(
      'WebSocket connection failed: wss://rpc.example.com/ws/WSSECRETTOKEN error details',
    );
    const sanitized = sanitizeError(err);
    expect(sanitized).not.toContain('WSSECRETTOKEN');
    expect(sanitized).not.toContain('wss://rpc.example.com');
    expect(sanitized).toContain('[REDACTED]');
  });
});

describe('simulate_transaction error sanitization', () => {
  beforeEach(() => {
    simulateTransactionMock.mockClear();
  });

  it('redacts a credentialed URL from a failed simulation result before returning it', async () => {
    const server = createFakeServer();
    const ctx = createApprovedContext();
    registerChainTools(server as any, () => ctx);

    simulateTransactionMock.mockResolvedValueOnce({
      success: false,
      error: 'HTTP request failed.\n\nURL: https://mainnet.infura.io/v3/SECRETKEY123\n\nDetails: fetch failed',
    });

    const handler = server.handlers.get('simulate_transaction')!;
    const result = await handler({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: '[]',
      function_name: 'deposit',
      args: [],
    });

    const text = result.content[0].text as string;
    expect(text).not.toContain('SECRETKEY123');
    expect(text).toContain('https://[REDACTED]');
  });
});
