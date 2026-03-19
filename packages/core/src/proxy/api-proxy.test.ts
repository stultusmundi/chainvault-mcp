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
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { module: 'contract', action: 'getabi', address: '0x1234' },
      apiKey: 'TEST_KEY',
    };

    await proxy.request(params);
    await proxy.request(params);

    expect(mockFetch).toHaveBeenCalledTimes(1); // second call uses cache
  });

  it('enforces per-second rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });

    const params = {
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
      baseUrl: 'https://api.etherscan.io',
      endpoint: '/api',
      params: { action: 'test' },
      apiKey: 'KEY',
    });

    const usage = proxy.getUsage('https://api.etherscan.io');
    expect(usage.totalRequests).toBe(1);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      proxy.request({
        baseUrl: 'https://api.etherscan.io',
        endpoint: '/api',
        params: {},
        apiKey: 'KEY',
      }),
    ).rejects.toThrow('403');
  });
});
