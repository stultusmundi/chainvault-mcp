import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_CHAINS,
  getChainConfig,
  getSupportedChainIds,
  getTestnetChains,
  getMainnetChains,
  getChainsWithFaucets,
  type ChainConfig,
} from './chains.js';

describe('Chain Registry', () => {
  it('has at least 14 supported chains', () => {
    expect(SUPPORTED_CHAINS.length).toBeGreaterThanOrEqual(14);
  });

  it('every chain has a unique chainId', () => {
    const ids = SUPPORTED_CHAINS.map((c) => c.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every chain has at least one HTTP RPC URL', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.rpcUrls.http.length).toBeGreaterThanOrEqual(1);
      for (const url of chain.rpcUrls.http) {
        expect(url).toMatch(/^https:\/\//);
      }
    }
  });

  it('every chain with websocket URLs uses wss://', () => {
    for (const chain of SUPPORTED_CHAINS) {
      if (chain.rpcUrls.websocket) {
        for (const url of chain.rpcUrls.websocket) {
          expect(url).toMatch(/^wss:\/\//);
        }
      }
    }
  });

  it('all chains have websocket URLs from publicnode', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.rpcUrls.websocket).toBeDefined();
      expect(chain.rpcUrls.websocket!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every chain has a valid network type', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(['mainnet', 'testnet']).toContain(chain.network);
    }
  });

  it('every chain has nativeCurrency with 18 decimals', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.nativeCurrency.decimals).toBe(18);
      expect(chain.nativeCurrency.symbol.length).toBeGreaterThan(0);
    }
  });

  it('all RPC URLs use publicnode.com', () => {
    for (const chain of SUPPORTED_CHAINS) {
      for (const url of chain.rpcUrls.http) {
        expect(url).toContain('publicnode.com');
      }
    }
  });

  describe('well-known chains', () => {
    it('includes Ethereum Mainnet (1)', () => {
      const eth = getChainConfig(1);
      expect(eth).toBeDefined();
      expect(eth!.name).toBe('Ethereum Mainnet');
      expect(eth!.network).toBe('mainnet');
      expect(eth!.nativeCurrency.symbol).toBe('ETH');
    });

    it('includes Sepolia (11155111)', () => {
      const sepolia = getChainConfig(11155111);
      expect(sepolia).toBeDefined();
      expect(sepolia!.network).toBe('testnet');
      expect(sepolia!.faucets).toBeDefined();
      expect(sepolia!.faucets!.length).toBeGreaterThanOrEqual(1);
    });

    it('includes Polygon (137)', () => {
      const polygon = getChainConfig(137);
      expect(polygon).toBeDefined();
      expect(polygon!.nativeCurrency.symbol).toBe('POL');
    });

    it('includes Arbitrum One (42161)', () => {
      expect(getChainConfig(42161)).toBeDefined();
    });

    it('includes Base (8453)', () => {
      expect(getChainConfig(8453)).toBeDefined();
    });

    it('includes BSC (56)', () => {
      const bsc = getChainConfig(56);
      expect(bsc).toBeDefined();
      expect(bsc!.nativeCurrency.symbol).toBe('BNB');
    });

    it('includes Avalanche C-Chain (43114)', () => {
      const avax = getChainConfig(43114);
      expect(avax).toBeDefined();
      expect(avax!.nativeCurrency.symbol).toBe('AVAX');
    });
  });

  describe('getChainConfig', () => {
    it('returns config for known chain', () => {
      const config = getChainConfig(1);
      expect(config).toBeDefined();
      expect(config!.chainId).toBe(1);
    });

    it('returns undefined for unknown chain', () => {
      expect(getChainConfig(999999)).toBeUndefined();
    });
  });

  describe('getSupportedChainIds', () => {
    it('returns all chain IDs', () => {
      const ids = getSupportedChainIds();
      expect(ids).toContain(1);
      expect(ids).toContain(11155111);
      expect(ids).toContain(137);
      expect(ids.length).toBe(SUPPORTED_CHAINS.length);
    });
  });

  describe('getTestnetChains', () => {
    it('returns only testnets', () => {
      const testnets = getTestnetChains();
      expect(testnets.length).toBeGreaterThan(0);
      for (const chain of testnets) {
        expect(chain.network).toBe('testnet');
      }
    });
  });

  describe('getMainnetChains', () => {
    it('returns only mainnets', () => {
      const mainnets = getMainnetChains();
      expect(mainnets.length).toBeGreaterThan(0);
      for (const chain of mainnets) {
        expect(chain.network).toBe('mainnet');
      }
    });
  });

  describe('getChainsWithFaucets', () => {
    it('returns only chains with faucets', () => {
      const faucetChains = getChainsWithFaucets();
      expect(faucetChains.length).toBeGreaterThan(0);
      for (const chain of faucetChains) {
        expect(chain.faucets).toBeDefined();
        expect(chain.faucets!.length).toBeGreaterThan(0);
      }
    });

    it('no mainnet chains have faucets', () => {
      const faucetChains = getChainsWithFaucets();
      for (const chain of faucetChains) {
        expect(chain.network).toBe('testnet');
      }
    });

    it('every faucet has a valid type', () => {
      const faucetChains = getChainsWithFaucets();
      for (const chain of faucetChains) {
        for (const faucet of chain.faucets!) {
          expect(['api', 'browser']).toContain(faucet.type);
          expect(faucet.url.length).toBeGreaterThan(0);
          expect(faucet.name.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
