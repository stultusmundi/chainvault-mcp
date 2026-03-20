# EVM Chain Registry, WebSocket Transport & Faucet Support — Design

**Date:** 2026-03-20
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

Add a built-in EVM chain registry with public RPC endpoints from [publicnode.com](https://publicnode.com/), WebSocket-first transport with HTTP fallback, and faucet support (programmatic where possible, browser URL fallback otherwise).

**Goals:**
- Zero-config chain access — agents can use supported chains without users adding RPC endpoints manually
- Lower latency via WebSocket transport where available
- Testnet faucet integration so agents can fund wallets autonomously

## 2. Chain Registry

### Data Structure

```typescript
interface ChainConfig {
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

interface FaucetConfig {
  name: string;
  url: string;
  type: 'api' | 'browser';
  requestEndpoint?: string;
  method?: 'POST' | 'GET';
}
```

### Supported Chains

All public RPCs from publicnode.com (free, no API key required).

| Chain | ID | Network | WS | HTTP |
|-------|-----|---------|-----|------|
| Ethereum Mainnet | 1 | mainnet | wss://ethereum-rpc.publicnode.com | https://ethereum-rpc.publicnode.com |
| Sepolia | 11155111 | testnet | wss://ethereum-sepolia-rpc.publicnode.com | https://ethereum-sepolia-rpc.publicnode.com |
| Holesky | 17000 | testnet | wss://ethereum-holesky-rpc.publicnode.com | https://ethereum-holesky-rpc.publicnode.com |
| Polygon | 137 | mainnet | wss://polygon-bor-rpc.publicnode.com | https://polygon-bor-rpc.publicnode.com |
| Polygon Amoy | 80002 | testnet | wss://polygon-amoy-bor-rpc.publicnode.com | https://polygon-amoy-bor-rpc.publicnode.com |
| Arbitrum One | 42161 | mainnet | wss://arbitrum-one-rpc.publicnode.com | https://arbitrum-one-rpc.publicnode.com |
| Arbitrum Sepolia | 421614 | testnet | wss://arbitrum-sepolia-rpc.publicnode.com | https://arbitrum-sepolia-rpc.publicnode.com |
| Optimism | 10 | mainnet | wss://optimism-rpc.publicnode.com | https://optimism-rpc.publicnode.com |
| Optimism Sepolia | 11155420 | testnet | wss://optimism-sepolia-rpc.publicnode.com | https://optimism-sepolia-rpc.publicnode.com |
| Base | 8453 | mainnet | wss://base-rpc.publicnode.com | https://base-rpc.publicnode.com |
| Base Sepolia | 84532 | testnet | wss://base-sepolia-rpc.publicnode.com | https://base-sepolia-rpc.publicnode.com |
| BSC | 56 | mainnet | wss://bsc-rpc.publicnode.com | https://bsc-rpc.publicnode.com |
| BSC Testnet | 97 | testnet | wss://bsc-testnet-rpc.publicnode.com | https://bsc-testnet-rpc.publicnode.com |
| Avalanche C-Chain | 43114 | mainnet | wss://avalanche-c-chain-rpc.publicnode.com | https://avalanche-c-chain-rpc.publicnode.com |
| Avalanche Fuji | 43113 | testnet | wss://avalanche-fuji-c-chain-rpc.publicnode.com | https://avalanche-fuji-c-chain-rpc.publicnode.com |

Attribution to publicnode.com included in the registry source file.

## 3. Transport Strategy

Use viem's `fallback()` transport to prefer WebSocket over HTTP:

```
WebSocket (lower latency, event subscriptions) → HTTP (always available, reliable fallback)
```

- viem handles automatic failover transparently
- Custom RPC endpoints from the vault override registry defaults
- Registry RPCs are used when no custom endpoint is configured for a chain

## 4. EvmAdapter Changes

- New static factory: `EvmAdapter.fromChainId(chainId, customRpcUrl?)` — looks up registry, builds transport with WS priority
- Constructor stays backward-compatible (raw URL still works)
- Fix duplicate `getChain()` method
- Add `getChainConfig()` to expose chain metadata

## 5. Faucet Module

```typescript
interface FaucetResult {
  success: boolean;
  txHash?: string;
  message: string;
  faucetUrl?: string;
}

async function requestFaucet(chainId: number, address: string): Promise<FaucetResult>
```

- `type: 'api'` faucets: HTTP request to faucet endpoint
- `type: 'browser'` faucets: return URL with instructions
- API failure: fall back to browser URL

## 6. MCP Tools

- **`list_supported_chains`** — all chains from registry with metadata
- **`request_faucet`** — chainId + address, attempts programmatic faucet, returns result or URL

## 7. Testing

- Chain registry validation (all configs well-formed, URLs present)
- Transport creation (mock viem, verify fallback order)
- Faucet (mock fetch for API faucets, browser-only fallback, error handling)
- EvmAdapter.fromChainId() integration
