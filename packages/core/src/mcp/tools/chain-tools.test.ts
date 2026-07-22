import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerChainTools, sanitizeError } from './chain-tools.js';
import type { AgentContext } from '../context.js';
import type { SimulateResult } from '../../chain/types.js';

// Typed to the adapter params the handlers actually pass, so `.mock.calls`
// carries real argument types (otherwise the args tuple infers as `[]`).
const writeContractMock = vi.fn(async (_params: { value?: string }) => ({ hash: '0xWriteTxHash' }));
const simulateTransactionMock = vi.fn(
  async (_params: { value?: string }): Promise<SimulateResult> => ({ success: true, result: null }),
);

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

describe('verify_contract Etherscan V2', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ctxWithExplorerKey(): AgentContext {
    return {
      ...createApprovedContext(),
      getApiKeyForExplorer: () => ({ serviceName: 'etherscan', key: 'SECRET_KEY' }),
    };
  }

  it('posts to the unified V2 endpoint with a chainid field', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: '1', result: 'GUID' }) });
    const server = createFakeServer();
    registerChainTools(server as any, () => ctxWithExplorerKey());

    await server.handlers.get('verify_contract')!({
      chain_id: 11155111,
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      source_code: 'contract C {}',
      contract_name: 'C',
      compiler_version: '0.8.24',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // V2 endpoint used verbatim — NOT the old `${apiUrl}/api` V1 shape.
    expect(String(url)).toBe('https://api.etherscan.io/v2/api');
    expect(String(url)).not.toContain('api-sepolia.etherscan.io');
    const body = String((init as { body: string }).body);
    expect(body).toContain('chainid=11155111');
    expect(body).toContain('action=verifysourcecode');
  });

  it('denies verification on an unsupported chain without any fetch', async () => {
    const server = createFakeServer();
    registerChainTools(server as any, () => ctxWithExplorerKey());

    const res = await server.handlers.get('verify_contract')!({
      chain_id: 999999,
      address: '0xabc',
      source_code: 'x',
      contract_name: 'C',
      compiler_version: '0.8.24',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.content[0].text).toMatch(/no block explorer/i);
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
