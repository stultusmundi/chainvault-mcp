import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiProxy } from './api-proxy.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ApiProxy', () => {
  let proxy: ApiProxy;

  beforeEach(() => {
    proxy = new ApiProxy();
    mockFetch.mockReset();
  });

  it('makes an API request with the provided key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: [{ abi: '[]' }] }),
    });

    const result = await proxy.request({
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
      apiKey: 'TEST_KEY',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apikey=TEST_KEY');
    expect(result.status).toBe('1');
  });

  it('caches identical requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'cached-data' }),
    });

    const params = {
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
      apiKey: 'TEST_KEY',
    };

    await proxy.request(params);
    await proxy.request(params);

    expect(mockFetch).toHaveBeenCalledTimes(1); // second call uses cache
  });

  it('does not serve one agent a response cached for another agent', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: 'data' }) });
    const base = {
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
    };
    await proxy.request({ ...base, apiKey: 'KEY_A', agentId: 'agent-a' });
    await proxy.request({ ...base, apiKey: 'KEY_B', agentId: 'agent-b' });
    // agent-b must trigger its own fetch (with its own key), not reuse agent-a's cache.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('apikey=KEY_B');
  });

  it('isolates rate-limit budgets per agent', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: 'ok' }) });
    const base = {
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      apiKey: 'KEY',
      rateLimits: { per_second: 1, daily: 1000 },
    };
    // Distinct params per request so none is a cache hit — this must exercise
    // the rate limiter, not the cache.
    await proxy.request({ ...base, params: { r: 'a1' }, agentId: 'agent-a' }); // a: 1/1
    // agent-b has its own budget and must still succeed.
    await expect(
      proxy.request({ ...base, params: { r: 'b1' }, agentId: 'agent-b' }),
    ).resolves.toBeDefined();
    // agent-a is now over its own limit.
    await expect(
      proxy.request({ ...base, params: { r: 'a2' }, agentId: 'agent-a' }),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('enforces per-second rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    const params = {
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
      rateLimits: { per_second: 2, daily: 1000 },
    };

    await proxy.request(params); // 1
    await proxy.request({ ...params, params: { action: 'test2' } }); // 2

    await expect(
      proxy.request({ ...params, params: { action: 'test3' } }), // 3 — exceeds
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('tracks usage per service', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    await proxy.request({
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
    });

    const usage = proxy.getUsage('test-agent', 'https://api.etherscan.io');
    expect(usage.totalRequests).toBe(1);
  });

  it('retries on transient failure then succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'recovered' }),
      });

    const result = await proxy.request({
      agentId: 'test-agent',
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
      retries: 2,
    });
    expect(result.result).toBe('recovered');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    await expect(
      proxy.request({
        agentId: 'test-agent',
        baseUrl: 'https://api.etherscan.io',
        endpoint: '/api',
        params: {},
        apiKey: 'KEY',
        retries: 2,
      }),
    ).rejects.toThrow('network error');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('applies request timeout', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    await expect(
      proxy.request({
        agentId: 'test-agent',
        baseUrl: 'https://api.etherscan.io',
        endpoint: '/api',
        params: {},
        apiKey: 'KEY',
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      proxy.request({
        agentId: 'test-agent',
        baseUrl: 'https://api.etherscan.io',
        endpoint: '/api',
        params: {},
        apiKey: 'KEY',
      }),
    ).rejects.toThrow('403');
  });
});
