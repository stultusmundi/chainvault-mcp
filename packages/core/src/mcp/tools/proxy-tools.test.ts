import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerProxyTools } from './proxy-tools.js';
import type { AgentContext } from '../context.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createFakeServer() {
  const handlers = new Map<string, (args: any) => Promise<any>>();
  return {
    handlers,
    registerTool: (name: string, _config: unknown, handler: (args: any) => Promise<any>) => {
      handlers.set(name, handler);
    },
  } as any;
}

function createContext(): AgentContext {
  return {
    agentName: 'price-agent',
    config: { api_access: {} } as unknown as AgentContext['config'],
    rules: {} as AgentContext['rules'],
    keys: [],
    getPrivateKeyForChain: () => null,
    getApiKey: () => null,
    getApiKeyForExplorer: () => null,
    getRpcUrlForChain: () => null,
  };
}

describe('query_price access control', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('denies when there is no agent context (no external call)', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerProxyTools(server, () => null, audit);
    const res = await server.handlers.get('query_price')({ token_id: 'ethereum' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.content[0].text).toMatch(/no agent context/i);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
  });

  it('fetches a price when an agent context is present', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ethereum: { usd: 3000 } }) });
    const server = createFakeServer();
    const audit = vi.fn();
    registerProxyTools(server, () => createContext(), audit);
    const res = await server.handlers.get('query_price')({ token_id: 'ethereum' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.content[0].text).toContain('3000');
  });
});

/** Context with a single Etherscan key that serves all chains (V2 model). */
function createExplorerContext(): AgentContext {
  return {
    agentName: 'explorer-agent',
    config: { api_access: { etherscan: {} } } as unknown as AgentContext['config'],
    rules: { checkApiRequest: () => ({ approved: true }) } as unknown as AgentContext['rules'],
    keys: [],
    getPrivateKeyForChain: () => null,
    getApiKey: () => null,
    getApiKeyForExplorer: () => ({ serviceName: 'etherscan', key: 'SECRET_KEY' }),
    getRpcUrlForChain: () => null,
  };
}

describe('query_explorer Etherscan V2', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('calls the unified V2 endpoint with a chainid param for Sepolia', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: '1', result: 'ok' }) });
    const server = createFakeServer();
    registerProxyTools(server, () => createExplorerContext(), vi.fn());

    await server.handlers.get('query_explorer')({
      chain_id: 11155111,
      module: 'contract',
      action: 'getabi',
      params: { address: '0xabc' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://api.etherscan.io/v2/api');
    expect(url).toContain('chainid=11155111');
    expect(url).toContain('module=contract');
    expect(url).toContain('action=getabi');
    expect(url).toContain('address=0xabc');
    // must NOT hit the deprecated V1 host
    expect(url).not.toContain('api-sepolia.etherscan.io');
  });

  it('sends the chain-specific chainid for a chain that had no V1 API (Base Sepolia)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: '1', result: 'ok' }) });
    const server = createFakeServer();
    registerProxyTools(server, () => createExplorerContext(), vi.fn());

    const res = await server.handlers.get('query_explorer')({
      chain_id: 84532,
      module: 'account',
      action: 'balance',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('chainid=84532');
    expect(res.content[0].text).toContain('ok');
  });

  it('does not let params override the whitelisted action/module/chainid', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: '1', result: 'ok' }) });
    const server = createFakeServer();
    registerProxyTools(server, () => createExplorerContext(), vi.fn());

    // Agent passes a crafted params trying to swap the checked action + chain.
    await server.handlers.get('query_explorer')({
      chain_id: 11155111,
      module: 'contract',
      action: 'getabi',
      params: { action: 'txlist', module: 'account', chainid: '1', address: '0xabc' },
    });

    const url = String(fetchMock.mock.calls[0][0]);
    // The trusted values win; the override attempt does not reach Etherscan.
    expect(url).toContain('action=getabi');
    expect(url).toContain('module=contract');
    expect(url).toContain('chainid=11155111');
    expect(url).not.toContain('action=txlist');
    expect(url).not.toContain('chainid=1&');
    expect(url).not.toMatch(/chainid=1$/);
    // legitimate extra params still flow through
    expect(url).toContain('address=0xabc');
  });

  it('denies an unsupported chain without any external call', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerProxyTools(server, () => createExplorerContext(), audit);

    const res = await server.handlers.get('query_explorer')({
      chain_id: 999999,
      module: 'contract',
      action: 'getabi',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.content[0].text).toMatch(/no block explorer/i);
  });
});
