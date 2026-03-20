import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestFaucet, getFaucetInfo } from './faucet.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('requestFaucet', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('rejects unknown chain ID', async () => {
    const result = await requestFaucet(999999, '0x1234');
    expect(result.success).toBe(false);
    expect(result.message).toContain('not in the supported chain registry');
  });

  it('rejects mainnet chains', async () => {
    const result = await requestFaucet(1, '0x1234');
    expect(result.success).toBe(false);
    expect(result.message).toContain('mainnet');
  });

  it('attempts API faucet and returns success with txHash', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ txHash: '0xabc123' }),
    });

    const result = await requestFaucet(11155111, '0x1234567890abcdef1234567890abcdef12345678');
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xabc123');
    expect(result.message).toContain('Faucet request sent');
    expect(result.chainName).toBe('Sepolia');
  });

  it('falls back to browser URL when API faucet returns error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    const result = await requestFaucet(11155111, '0x1234567890abcdef1234567890abcdef12345678');
    expect(result.success).toBe(false);
    expect(result.faucetUrl).toBeDefined();
    expect(result.message).toContain('Visit the faucet manually');
  });

  it('falls back to browser URL when API faucet throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await requestFaucet(11155111, '0x1234567890abcdef1234567890abcdef12345678');
    expect(result.success).toBe(false);
    expect(result.faucetUrl).toBeDefined();
  });

  it('returns browser URL for browser-only faucet chains', async () => {
    // Arbitrum Sepolia only has browser faucets
    const result = await requestFaucet(421614, '0x1234567890abcdef1234567890abcdef12345678');
    expect(result.success).toBe(false);
    expect(result.faucetUrl).toBeDefined();
    expect(result.message).toContain('Visit the faucet manually');
  });

  it('sends POST request with address to API faucet', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hash: '0xdef456' }),
    });

    await requestFaucet(11155111, '0xMyAddress');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '0xMyAddress' }),
      }),
    );
  });

  it('handles API response with alternative hash field names', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactionHash: '0xtxhash' }),
    });

    const result = await requestFaucet(11155111, '0x1234');
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xtxhash');
  });
});

describe('getFaucetInfo', () => {
  it('returns faucet info for testnet chain', () => {
    const info = getFaucetInfo(11155111);
    expect(info.available).toBe(true);
    expect(info.faucets.length).toBeGreaterThan(0);
    expect(info.chainName).toBe('Sepolia');
  });

  it('returns no faucets for mainnet chain', () => {
    const info = getFaucetInfo(1);
    expect(info.available).toBe(false);
    expect(info.faucets).toHaveLength(0);
  });

  it('returns not available for unknown chain', () => {
    const info = getFaucetInfo(999999);
    expect(info.available).toBe(false);
  });

  it('returns faucets with correct types', () => {
    const info = getFaucetInfo(11155111);
    for (const faucet of info.faucets) {
      expect(['api', 'browser']).toContain(faucet.type);
    }
  });
});
