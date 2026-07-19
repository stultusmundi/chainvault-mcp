/**
 * Pinned mainnet snapshot for deterministic, RPC-cacheable fork tests.
 *
 * Default RPC is drpc.org, not publicnode: publicnode's free tier rejects any
 * eth_getBalance/eth_getCode at a non-"latest" block tag with a 403 ("Archive
 * requests require a personal token"), even for blocks only ~100 behind head —
 * so a pinned historical block never works there. drpc.org serves this exact
 * pinned block for free. Override via WORKSTYLE_FORK_URL if needed.
 */
export const FORK_BLOCK = 23_000_000;
export const FORK_URL = process.env.WORKSTYLE_FORK_URL ?? 'https://eth.drpc.org';
export const FORK_ENABLED = process.env.WORKSTYLE_FORK === '1';

export const MAINNET = {
  WETH9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  UNISWAP_V3_QUOTER_V1: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  /** Binance 8 — large ETH/USDT holder, used via anvil impersonation. */
  WHALE: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
} as const;

export const WETH_ABI = [
  { inputs: [], name: 'deposit', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'wad', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

export const ERC20_MIN_ABI = [
  { inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'transfer', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'approve', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

export const QUOTER_V1_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' }, { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle', outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable', type: 'function',
  },
] as const;
