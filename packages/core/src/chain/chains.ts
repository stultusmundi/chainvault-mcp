/**
 * Built-in EVM chain registry with public RPC endpoints.
 *
 * Public RPCs provided by https://publicnode.com/ — free, no API key required.
 * Thank you to PublicNode for providing reliable public infrastructure.
 */

export interface FaucetConfig {
  name: string;
  url: string;
  type: 'api' | 'browser';
  requestEndpoint?: string;
  method?: 'POST' | 'GET';
}

export interface ChainConfig {
  chainId: number;
  name: string;
  network: 'mainnet' | 'testnet';
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: {
    websocket?: string[];
    http: string[];
  };
  blockExplorer?: { name: string; url: string; apiUrl?: string };
  faucets?: FaucetConfig[];
}

const ETH_CURRENCY = { name: 'Ether', symbol: 'ETH', decimals: 18 };
const MATIC_CURRENCY = { name: 'POL', symbol: 'POL', decimals: 18 };
const BNB_CURRENCY = { name: 'BNB', symbol: 'BNB', decimals: 18 };
const AVAX_CURRENCY = { name: 'Avalanche', symbol: 'AVAX', decimals: 18 };

export const SUPPORTED_CHAINS: ReadonlyArray<ChainConfig> = [
  // --- Ethereum ---
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    network: 'mainnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://ethereum-rpc.publicnode.com'],
      http: ['https://ethereum-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Etherscan', url: 'https://etherscan.io', apiUrl: 'https://api.etherscan.io' },
  },
  {
    chainId: 11155111,
    name: 'Sepolia',
    network: 'testnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://ethereum-sepolia-rpc.publicnode.com'],
      http: ['https://ethereum-sepolia-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Etherscan Sepolia', url: 'https://sepolia.etherscan.io', apiUrl: 'https://api-sepolia.etherscan.io' },
    faucets: [
      { name: 'Google Cloud Faucet', url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia', type: 'api', requestEndpoint: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia', method: 'POST' },
      { name: 'Sepolia PoW Faucet', url: 'https://sepolia-faucet.pk910.de', type: 'browser' },
      { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia', type: 'browser' },
    ],
  },
  // --- Polygon ---
  {
    chainId: 137,
    name: 'Polygon',
    network: 'mainnet',
    nativeCurrency: MATIC_CURRENCY,
    rpcUrls: {
      websocket: ['wss://polygon-bor-rpc.publicnode.com'],
      http: ['https://polygon-bor-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'PolygonScan', url: 'https://polygonscan.com', apiUrl: 'https://api.polygonscan.com' },
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    network: 'testnet',
    nativeCurrency: MATIC_CURRENCY,
    rpcUrls: {
      websocket: ['wss://polygon-amoy-bor-rpc.publicnode.com'],
      http: ['https://polygon-amoy-bor-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'PolygonScan Amoy', url: 'https://amoy.polygonscan.com' },
    faucets: [
      { name: 'Polygon Faucet', url: 'https://faucet.polygon.technology', type: 'browser' },
      { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/polygon-amoy', type: 'browser' },
    ],
  },

  // --- Arbitrum ---
  {
    chainId: 42161,
    name: 'Arbitrum One',
    network: 'mainnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://arbitrum-one-rpc.publicnode.com'],
      http: ['https://arbitrum-one-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Arbiscan', url: 'https://arbiscan.io', apiUrl: 'https://api.arbiscan.io' },
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    network: 'testnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://arbitrum-sepolia-rpc.publicnode.com'],
      http: ['https://arbitrum-sepolia-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Arbiscan Sepolia', url: 'https://sepolia.arbiscan.io' },
    faucets: [
      { name: 'Arbitrum Faucet', url: 'https://faucet.quicknode.com/arbitrum/sepolia', type: 'browser' },
    ],
  },

  // --- Optimism ---
  {
    chainId: 10,
    name: 'Optimism',
    network: 'mainnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://optimism-rpc.publicnode.com'],
      http: ['https://optimism-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Optimism Explorer', url: 'https://optimistic.etherscan.io', apiUrl: 'https://api-optimistic.etherscan.io' },
  },
  {
    chainId: 11155420,
    name: 'Optimism Sepolia',
    network: 'testnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://optimism-sepolia-rpc.publicnode.com'],
      http: ['https://optimism-sepolia-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Optimism Sepolia Explorer', url: 'https://sepolia-optimistic.etherscan.io' },
    faucets: [
      { name: 'Superchain Faucet', url: 'https://app.optimism.io/faucet', type: 'browser' },
    ],
  },

  // --- Base ---
  {
    chainId: 8453,
    name: 'Base',
    network: 'mainnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://base-rpc.publicnode.com'],
      http: ['https://base-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'BaseScan', url: 'https://basescan.org', apiUrl: 'https://api.basescan.org' },
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    network: 'testnet',
    nativeCurrency: ETH_CURRENCY,
    rpcUrls: {
      websocket: ['wss://base-sepolia-rpc.publicnode.com'],
      http: ['https://base-sepolia-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'BaseScan Sepolia', url: 'https://sepolia.basescan.org' },
    faucets: [
      { name: 'Superchain Faucet', url: 'https://app.optimism.io/faucet', type: 'browser' },
      { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia', type: 'browser' },
    ],
  },

  // --- BSC ---
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    network: 'mainnet',
    nativeCurrency: BNB_CURRENCY,
    rpcUrls: {
      websocket: ['wss://bsc-rpc.publicnode.com'],
      http: ['https://bsc-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'BscScan', url: 'https://bscscan.com', apiUrl: 'https://api.bscscan.com' },
  },
  {
    chainId: 97,
    name: 'BSC Testnet',
    network: 'testnet',
    nativeCurrency: BNB_CURRENCY,
    rpcUrls: {
      websocket: ['wss://bsc-testnet-rpc.publicnode.com'],
      http: ['https://bsc-testnet-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'BscScan Testnet', url: 'https://testnet.bscscan.com' },
    faucets: [
      { name: 'BSC Faucet', url: 'https://www.bnbchain.org/en/testnet-faucet', type: 'browser' },
    ],
  },

  // --- Avalanche ---
  {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    network: 'mainnet',
    nativeCurrency: AVAX_CURRENCY,
    rpcUrls: {
      websocket: ['wss://avalanche-c-chain-rpc.publicnode.com'],
      http: ['https://avalanche-c-chain-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Snowtrace', url: 'https://snowtrace.io' },
  },
  {
    chainId: 43113,
    name: 'Avalanche Fuji',
    network: 'testnet',
    nativeCurrency: AVAX_CURRENCY,
    rpcUrls: {
      websocket: ['wss://avalanche-fuji-c-chain-rpc.publicnode.com'],
      http: ['https://avalanche-fuji-c-chain-rpc.publicnode.com'],
    },
    blockExplorer: { name: 'Snowtrace Fuji', url: 'https://testnet.snowtrace.io' },
    faucets: [
      { name: 'Avalanche Faucet', url: 'https://core.app/tools/testnet-faucet/?subnet=c&token=c', type: 'api', requestEndpoint: 'https://api.avax-test.network/ext/bc/C/rpc', method: 'POST' },
    ],
  },
] as const;

// --- Lookup helpers ---

const chainMap = new Map<number, ChainConfig>(
  SUPPORTED_CHAINS.map((c) => [c.chainId, c]),
);

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return chainMap.get(chainId);
}

export function getSupportedChainIds(): number[] {
  return SUPPORTED_CHAINS.map((c) => c.chainId);
}

export function getTestnetChains(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((c) => c.network === 'testnet');
}

export function getMainnetChains(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((c) => c.network === 'mainnet');
}

export function getChainsWithFaucets(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((c) => c.faucets && c.faucets.length > 0);
}
