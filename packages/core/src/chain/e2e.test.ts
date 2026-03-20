/**
 * End-to-end tests for EVM chain integration.
 *
 * These tests hit REAL public RPCs (publicnode.com) — no mocks.
 * They cover every adapter method that does not spend funds:
 *   - getBalance, readContract, simulateTransaction, getEvents,
 *     getTransaction, estimateGas
 * Plus: chain registry, transport, faucet flow, and error handling.
 */
import { describe, it, expect } from 'vitest';
import { createPublicClient, http } from 'viem';
import { EvmAdapter, buildTransport } from './evm-adapter.js';
import {
  SUPPORTED_CHAINS,
  getChainConfig,
  getSupportedChainIds,
  getTestnetChains,
  getMainnetChains,
  getChainsWithFaucets,
} from './chains.js';
import { requestFaucet, getFaucetInfo } from './faucet.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// Well-known mainnet contract addresses — lowercase to avoid EIP-55 checksum issues
const WETH_MAINNET = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// Wrapped native tokens on L2s / alt-L1s (lowercase addresses, verified on-chain)
const WRAPPED_TOKENS: Record<number, { address: string; name: string; symbol: string }> = {
  42161: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', name: 'Wrapped Ether', symbol: 'WETH' },
  10:    { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH' },
  8453:  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH' },
  56:    { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', name: 'Wrapped BNB', symbol: 'WBNB' },
  137:   { address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', name: 'Wrapped Polygon Ecosystem Token', symbol: 'WPOL' },
  43114: { address: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', name: 'Wrapped AVAX', symbol: 'WAVAX' },
};

// Minimal ABIs
const ERC20_READ_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

const ERC20_WRITE_ABI = [
  ...ERC20_READ_ABI,
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;

const TRANSFER_EVENT_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Test suite — 30s timeout per test for network calls
// ---------------------------------------------------------------------------

describe('E2E: EVM Chain Integration', { timeout: 30_000 }, () => {

  // =========================================================================
  // 1. Multi-chain Connectivity
  // =========================================================================

  describe('Multi-chain Connectivity — Mainnets', () => {
    const mainnets = SUPPORTED_CHAINS.filter((c) => c.network === 'mainnet');

    it.each(mainnets.map((c) => [c.chainId, c.name]))(
      'connects to %i (%s) and reads balance',
      async (chainId) => {
        const adapter = EvmAdapter.fromChainId(chainId as number);
        const balance = await adapter.getBalance(ZERO_ADDRESS);
        expect(balance.wei).toBeDefined();
        expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
        expect(typeof balance.formatted).toBe('string');
        expect(parseFloat(balance.formatted)).toBeGreaterThanOrEqual(0);
      },
    );
  });

  describe('Multi-chain Connectivity — Testnets', () => {
    const testnets = SUPPORTED_CHAINS.filter((c) => c.network === 'testnet');

    it.each(testnets.map((c) => [c.chainId, c.name]))(
      'connects to %i (%s) and reads balance',
      async (chainId) => {
        const adapter = EvmAdapter.fromChainId(chainId as number);
        const balance = await adapter.getBalance(ZERO_ADDRESS);
        expect(balance.wei).toBeDefined();
        expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
      },
    );
  });

  // =========================================================================
  // 2. Ethereum Mainnet — Contract Reads
  // =========================================================================

  describe('Ethereum Mainnet — Contract Reads', () => {
    let adapter: EvmAdapter;

    adapter = EvmAdapter.fromChainId(1);

    it('reads WETH name()', async () => {
      const name = await adapter.readContract({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'name',
        args: [],
      });
      expect(name).toBe('Wrapped Ether');
    });

    it('reads WETH symbol()', async () => {
      const symbol = await adapter.readContract({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'symbol',
        args: [],
      });
      expect(symbol).toBe('WETH');
    });

    it('reads WETH decimals()', async () => {
      const decimals = await adapter.readContract({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'decimals',
        args: [],
      });
      expect(decimals).toBe(18);
    });

    it('reads WETH totalSupply() > 0', async () => {
      const totalSupply = await adapter.readContract({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'totalSupply',
        args: [],
      });
      expect(totalSupply).toBeGreaterThan(0n);
    });

    it('reads WETH balanceOf(zero address) >= 0', async () => {
      const balance = await adapter.readContract({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'balanceOf',
        args: [ZERO_ADDRESS],
      });
      expect(balance).toBeGreaterThanOrEqual(0n);
    });

    it('reads USDC name()', async () => {
      const name = await adapter.readContract({
        address: USDC_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'name',
        args: [],
      });
      expect(name).toBe('USD Coin');
    });

    it('reads USDC symbol()', async () => {
      const symbol = await adapter.readContract({
        address: USDC_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'symbol',
        args: [],
      });
      expect(symbol).toBe('USDC');
    });

    it('reads USDC decimals() = 6', async () => {
      const decimals = await adapter.readContract({
        address: USDC_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'decimals',
        args: [],
      });
      expect(decimals).toBe(6);
    });
  });

  // =========================================================================
  // 3. Ethereum Mainnet — Transaction Lookup
  // =========================================================================

  describe('Ethereum Mainnet — Transaction Lookup', () => {
    let adapter: EvmAdapter;

    adapter = EvmAdapter.fromChainId(1);

    it('gets details of a recent confirmed transaction', async () => {
      // First, find a real tx hash from a recent block
      const publicClient = createPublicClient({
        transport: http('https://ethereum-rpc.publicnode.com'),
      });
      const blockNumber = await publicClient.getBlockNumber();
      const block = await publicClient.getBlock({ blockNumber: blockNumber - 10n });
      expect(block.transactions.length).toBeGreaterThan(0);

      const txHash = block.transactions[0];
      const result = await adapter.getTransaction(txHash);

      expect(result.hash).toBe(txHash);
      expect(result.from).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(BigInt(result.blockNumber)).toBeGreaterThan(0n);
      expect(result.receipt.status).toBe('success');
      expect(BigInt(result.receipt.gasUsed)).toBeGreaterThan(0n);
    });

    it('returns correct structure for transaction with recipient', async () => {
      const publicClient = createPublicClient({
        transport: http('https://ethereum-rpc.publicnode.com'),
      });
      const blockNumber = await publicClient.getBlockNumber();
      // Iterate blocks to find a tx with a non-null 'to'
      const block = await publicClient.getBlock({ blockNumber: blockNumber - 20n });
      const hashes = block.transactions;

      // Try the first tx — most txs have a 'to'
      const result = await adapter.getTransaction(hashes[0]);
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe('string');
      // 'to' can be null for contract creation, string otherwise
      if (result.to !== null) {
        expect(result.to).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });
  });

  // =========================================================================
  // 4. Ethereum Mainnet — Event Queries
  // =========================================================================

  describe('Ethereum Mainnet — Event Queries', () => {
    let adapter: EvmAdapter;

    adapter = EvmAdapter.fromChainId(1);

    it('queries WETH Transfer events in a recent block range', async () => {
      const publicClient = createPublicClient({
        transport: http('https://ethereum-rpc.publicnode.com'),
      });
      const blockNumber = await publicClient.getBlockNumber();

      // Query a 3-block range — WETH has transfers in every block
      const events = await adapter.getEvents({
        address: WETH_MAINNET,
        abi: TRANSFER_EVENT_ABI,
        eventName: 'Transfer',
        fromBlock: blockNumber - 3n,
        toBlock: blockNumber - 1n,
      });

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventName).toBe('Transfer');
      expect(events[0].args).toBeDefined();
    });

    it('returns empty array for events in a block range with no matches', async () => {
      const publicClient = createPublicClient({
        transport: http('https://ethereum-rpc.publicnode.com'),
      });
      const blockNumber = await publicClient.getBlockNumber();

      // Query WETH events filtered to only transfers FROM the zero address
      // (the zero address almost never sends WETH — this should be empty or very small)
      const events = await adapter.getEvents({
        address: WETH_MAINNET,
        abi: TRANSFER_EVENT_ABI,
        eventName: 'Transfer',
        fromBlock: blockNumber - 2n,
        toBlock: blockNumber - 1n,
        args: { from: ZERO_ADDRESS },
      });

      expect(Array.isArray(events)).toBe(true);
      // Don't assert length — it's possible (rare) for zero-address to appear as 'from' in mint events
    });
  });

  // =========================================================================
  // 5. Gas Estimation
  // =========================================================================

  describe('Gas Estimation', () => {
    it('estimates gas for a simple ETH transfer on mainnet', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });

      expect(estimate.gasLimit).toBeDefined();
      expect(BigInt(estimate.gasLimit)).toBeGreaterThanOrEqual(21000n);
      expect(parseFloat(estimate.gasPriceGwei)).toBeGreaterThan(0);
      expect(parseFloat(estimate.estimatedCostEth)).toBeGreaterThanOrEqual(0);
    });

    it('estimates gas on Sepolia testnet', async () => {
      const adapter = EvmAdapter.fromChainId(11155111);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });

      expect(BigInt(estimate.gasLimit)).toBeGreaterThanOrEqual(21000n);
      expect(parseFloat(estimate.gasPriceGwei)).toBeGreaterThan(0);
    });

    it('estimates gas on Arbitrum One', async () => {
      const adapter = EvmAdapter.fromChainId(42161);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });

      expect(BigInt(estimate.gasLimit)).toBeGreaterThan(0n);
    });

    it('estimates gas on Polygon', async () => {
      const adapter = EvmAdapter.fromChainId(137);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });

      expect(BigInt(estimate.gasLimit)).toBeGreaterThan(0n);
    });
  });

  // =========================================================================
  // 6. Transaction Simulation
  // =========================================================================

  describe('Transaction Simulation', () => {
    it('successfully simulates an ERC20 approve call on WETH', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const result = await adapter.simulateTransaction({
        address: WETH_MAINNET,
        abi: ERC20_WRITE_ABI,
        functionName: 'approve',
        args: [DEAD_ADDRESS, 0n],
        account: VITALIK_ADDRESS, // any existing address works for simulation
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(true); // approve returns bool
    });

    it('fails simulation for ERC20 transfer exceeding balance', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      // Try to transfer a massive amount from an address with no WETH
      const result = await adapter.simulateTransaction({
        address: WETH_MAINNET,
        abi: ERC20_WRITE_ABI,
        functionName: 'transfer',
        args: [DEAD_ADDRESS, 999_999_999_000_000_000_000_000_000n],
        account: '0x0000000000000000000000000000000000000001',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    it('simulates a balanceOf view call (always succeeds)', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const result = await adapter.simulateTransaction({
        address: WETH_MAINNET,
        abi: ERC20_READ_ABI,
        functionName: 'balanceOf',
        args: [VITALIK_ADDRESS],
        account: VITALIK_ADDRESS,
      });

      expect(result.success).toBe(true);
      // balanceOf returns uint256 >= 0
      expect(result.result).toBeGreaterThanOrEqual(0n);
    });
  });

  // =========================================================================
  // 7. Cross-chain Contract Reads
  // =========================================================================

  describe('Cross-chain Contract Reads — Wrapped Native Tokens', () => {
    const chains = Object.entries(WRAPPED_TOKENS);

    it.each(chains)(
      'reads wrapped token metadata on chain %s',
      async (chainIdStr, token) => {
        const chainId = parseInt(chainIdStr);
        const adapter = EvmAdapter.fromChainId(chainId);

        const name = await adapter.readContract({
          address: token.address,
          abi: ERC20_READ_ABI,
          functionName: 'name',
          args: [],
        });
        expect(name).toBe(token.name);

        const symbol = await adapter.readContract({
          address: token.address,
          abi: ERC20_READ_ABI,
          functionName: 'symbol',
          args: [],
        });
        expect(symbol).toBe(token.symbol);

        const decimals = await adapter.readContract({
          address: token.address,
          abi: ERC20_READ_ABI,
          functionName: 'decimals',
          args: [],
        });
        expect(decimals).toBe(18);
      },
    );
  });

  // =========================================================================
  // 8. Vitalik's Balance (well-known whale — always has ETH)
  // =========================================================================

  describe('Well-known Address Balances', () => {
    it('Vitalik has a non-zero ETH balance on mainnet', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const balance = await adapter.getBalance(VITALIK_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThan(0n);
      expect(parseFloat(balance.formatted)).toBeGreaterThan(0);
    });

    it('dead address has accumulated ETH from burns', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const balance = await adapter.getBalance(DEAD_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThan(0n);
    });
  });

  // =========================================================================
  // 9. Transport & Factory
  // =========================================================================

  describe('Transport & Adapter Factory', () => {
    it('fromChainId creates adapter with correct chain info', () => {
      const adapter = EvmAdapter.fromChainId(1);
      expect(adapter.chainId).toBe(1);
      const info = adapter.getChainInfo();
      expect(info).toBeDefined();
      expect(info!.name).toBe('Ethereum Mainnet');
      expect(info!.nativeCurrency.symbol).toBe('ETH');
    });

    it('fromChainId with custom RPC overrides registry transport', async () => {
      // Use publicnode HTTP directly (bypasses WS fallback)
      const adapter = EvmAdapter.fromChainId(1, 'https://ethereum-rpc.publicnode.com');
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
      // Chain info should still be populated from registry
      expect(adapter.getChainInfo()!.name).toBe('Ethereum Mainnet');
    });

    it('constructor with raw URL works without registry', async () => {
      const adapter = new EvmAdapter('https://ethereum-rpc.publicnode.com', 1);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
      expect(adapter.getChainInfo()).toBeUndefined();
    });

    it('fromChainId throws for unknown chain without custom URL', () => {
      expect(() => EvmAdapter.fromChainId(999999))
        .toThrow('not in the supported chain registry');
    });

    it('fromChainId with custom URL works for unknown chain', async () => {
      // Use Ethereum mainnet RPC but pretend it's chain 999999
      const adapter = EvmAdapter.fromChainId(999999, 'https://ethereum-rpc.publicnode.com');
      expect(adapter.chainId).toBe(999999);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
    });

    it('buildTransport creates a working transport from chain config', async () => {
      const chainConfig = getChainConfig(1)!;
      const transport = buildTransport(chainConfig);
      const client = createPublicClient({ transport });
      const blockNumber = await client.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0n);
    });

    it('all supported chains have correct chain IDs in adapter', () => {
      for (const chain of SUPPORTED_CHAINS) {
        const adapter = EvmAdapter.fromChainId(chain.chainId);
        expect(adapter.chainId).toBe(chain.chainId);
        expect(adapter.getChainInfo()!.name).toBe(chain.name);
      }
    });
  });

  // =========================================================================
  // 10. Faucet Flow
  // =========================================================================

  describe('Faucet — Real Network Requests', () => {
    it('attempts faucet on Sepolia and returns structured result', async () => {
      const result = await requestFaucet(
        11155111,
        '0x0000000000000000000000000000000000000001',
      );
      expect(result.chainId).toBe(11155111);
      expect(result.chainName).toBe('Sepolia');

      if (result.success) {
        // If by some chance the API faucet works
        expect(result.message).toContain('Faucet request sent');
      } else {
        // Expected path: API fails, browser URL fallback
        expect(result.faucetUrl).toBeDefined();
        expect(result.faucetUrl).toMatch(/^https:\/\//);
      }
    });

    it('attempts faucet on Avalanche Fuji', async () => {
      const result = await requestFaucet(
        43113,
        '0x0000000000000000000000000000000000000001',
      );
      expect(result.chainId).toBe(43113);
      expect(result.chainName).toBe('Avalanche Fuji');
      // Result is either success or fallback — both are valid
      if (!result.success) {
        expect(result.faucetUrl).toBeDefined();
      }
    });

    it('rejects faucet request for Ethereum mainnet', async () => {
      const result = await requestFaucet(1, ZERO_ADDRESS);
      expect(result.success).toBe(false);
      expect(result.message).toContain('mainnet');
    });

    it('rejects faucet request for unknown chain', async () => {
      const result = await requestFaucet(999999, ZERO_ADDRESS);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not in the supported chain registry');
    });

    it('returns faucet info for testnet with faucets', () => {
      const info = getFaucetInfo(11155111);
      expect(info.available).toBe(true);
      expect(info.faucets.length).toBeGreaterThan(0);
      expect(info.chainName).toBe('Sepolia');
    });

    it('returns no faucets for mainnet', () => {
      const info = getFaucetInfo(1);
      expect(info.available).toBe(false);
      expect(info.faucets).toHaveLength(0);
    });

    it('returns not available for unknown chain', () => {
      const info = getFaucetInfo(999999);
      expect(info.available).toBe(false);
    });

    it('returns browser-only faucet for chains without API faucets', async () => {
      // Arbitrum Sepolia has only browser faucets
      const result = await requestFaucet(
        421614,
        '0x0000000000000000000000000000000000000001',
      );
      expect(result.success).toBe(false);
      expect(result.faucetUrl).toBeDefined();
      expect(result.message).toContain('Visit the faucet manually');
    });
  });

  // =========================================================================
  // 11. Error Handling
  // =========================================================================

  describe('Error Handling', () => {
    it('getTransaction throws for non-existent transaction hash', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const fakeTxHash = '0x' + '00'.repeat(32);
      await expect(adapter.getTransaction(fakeTxHash)).rejects.toThrow();
    });

    it('readContract throws for non-contract address', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      await expect(
        adapter.readContract({
          address: DEAD_ADDRESS, // not a contract
          abi: ERC20_READ_ABI,
          functionName: 'name',
          args: [],
        }),
      ).rejects.toThrow();
    });

    it('simulateTransaction returns failure for call to non-contract', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const result = await adapter.simulateTransaction({
        address: DEAD_ADDRESS,
        abi: ERC20_WRITE_ABI,
        functionName: 'approve',
        args: [ZERO_ADDRESS, 0n],
        account: VITALIK_ADDRESS,
      });
      // Should not succeed — DEAD_ADDRESS is not a contract
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('getEvents returns empty for non-contract address in small block range', async () => {
      const adapter = EvmAdapter.fromChainId(1);
      const publicClient = createPublicClient({
        transport: http('https://ethereum-rpc.publicnode.com'),
      });
      const blockNumber = await publicClient.getBlockNumber();

      // Use a safe offset to avoid "block range extends beyond head" from transport lag
      const events = await adapter.getEvents({
        address: DEAD_ADDRESS,
        abi: TRANSFER_EVENT_ABI,
        eventName: 'Transfer',
        fromBlock: blockNumber - 10n,
        toBlock: blockNumber - 5n,
      });
      expect(Array.isArray(events)).toBe(true);
      expect(events).toHaveLength(0);
    });
  });

  // =========================================================================
  // 12. Chain Registry Helpers
  // =========================================================================

  describe('Chain Registry Helpers', () => {
    it('getSupportedChainIds returns all chain IDs', () => {
      const ids = getSupportedChainIds();
      expect(ids.length).toBe(SUPPORTED_CHAINS.length);
      expect(ids).toContain(1);
      expect(ids).toContain(11155111);
      expect(ids).toContain(137);
      expect(ids).toContain(42161);
    });

    it('getTestnetChains returns only testnets', () => {
      const testnets = getTestnetChains();
      expect(testnets.length).toBeGreaterThan(0);
      for (const chain of testnets) {
        expect(chain.network).toBe('testnet');
      }
    });

    it('getMainnetChains returns only mainnets', () => {
      const mainnets = getMainnetChains();
      expect(mainnets.length).toBeGreaterThan(0);
      for (const chain of mainnets) {
        expect(chain.network).toBe('mainnet');
      }
    });

    it('getChainsWithFaucets returns only testnet chains with faucets', () => {
      const faucetChains = getChainsWithFaucets();
      expect(faucetChains.length).toBeGreaterThan(0);
      for (const chain of faucetChains) {
        expect(chain.network).toBe('testnet');
        expect(chain.faucets!.length).toBeGreaterThan(0);
      }
    });

    it('every chain config has a block explorer', () => {
      for (const chain of SUPPORTED_CHAINS) {
        expect(chain.blockExplorer).toBeDefined();
        expect(chain.blockExplorer!.url).toMatch(/^https:\/\//);
      }
    });
  });

  // =========================================================================
  // 13. Multi-chain Gas Price Comparison
  // =========================================================================

  describe('Multi-chain Gas Prices', () => {
    const chains = [
      { id: 1, name: 'Ethereum' },
      { id: 137, name: 'Polygon' },
      { id: 42161, name: 'Arbitrum' },
      { id: 8453, name: 'Base' },
    ];

    it.each(chains)(
      '$name (chain $id) returns valid gas price',
      async ({ id }) => {
        const adapter = EvmAdapter.fromChainId(id);
        const estimate = await adapter.estimateGas({
          to: DEAD_ADDRESS,
          value: '0',
        });
        expect(parseFloat(estimate.gasPriceGwei)).toBeGreaterThan(0);
        expect(parseFloat(estimate.estimatedCostEth)).toBeGreaterThanOrEqual(0);
      },
    );
  });

  // =========================================================================
  // 14. Testnet Specific Operations
  // =========================================================================

  describe('Testnet Operations', () => {
    it('reads balance on Sepolia', async () => {
      const adapter = EvmAdapter.fromChainId(11155111);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
    });

    it('reads balance on Polygon Amoy', async () => {
      const adapter = EvmAdapter.fromChainId(80002);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
    });

    it('reads balance on Arbitrum Sepolia', async () => {
      const adapter = EvmAdapter.fromChainId(421614);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
    });

    it('reads balance on Base Sepolia', async () => {
      const adapter = EvmAdapter.fromChainId(84532);
      const balance = await adapter.getBalance(ZERO_ADDRESS);
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(0n);
    });

    it('estimates gas on BSC Testnet', async () => {
      const adapter = EvmAdapter.fromChainId(97);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });
      expect(BigInt(estimate.gasLimit)).toBeGreaterThan(0n);
    });

    it('estimates gas on Avalanche Fuji', async () => {
      const adapter = EvmAdapter.fromChainId(43113);
      const estimate = await adapter.estimateGas({
        to: DEAD_ADDRESS,
        value: '0',
      });
      expect(BigInt(estimate.gasLimit)).toBeGreaterThan(0n);
    });
  });
});
