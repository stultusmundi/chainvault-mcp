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
