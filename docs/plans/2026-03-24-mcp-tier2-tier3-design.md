# MCP Tool Wiring (Tier 2 + Tier 3) — Design Document

**Date:** 2026-03-24
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

Wire remaining 5 MCP tool stubs: write operations (deploy_contract, interact_contract, verify_contract) and API proxy tools (query_explorer, query_price). Also fix the tsc OOM build issue by switching to esbuild.

## 2. Tier 2 — Write Operations

### deploy_contract
1. Rules check: chain access + tx type `deploy` + spend limits
2. Extract private key from `ctx.vaultData.keys` for matching chain
3. Call `EvmAdapter.deployContract({ privateKey, abi, bytecode, args })`
4. Record spend via `ctx.rules.recordSpend()`
5. Return `{ hash, contractAddress }`

### interact_contract
1. Rules check: chain access + tx type `write` + spend limits + contract whitelist/blacklist
2. Extract private key, call `EvmAdapter.writeContract()`
3. Record spend, return `{ hash }`

### verify_contract
1. Rules check: chain access + API access for explorer
2. Get API key from `ctx.vaultData.api_keys`
3. POST to Etherscan verification endpoint
4. Return verification status

## 3. Tier 3 — API Proxy

### query_explorer
1. Rules check: API access for explorer service
2. Get API key from vault, map chain_id to explorer URL
3. Call `ApiProxy.request()` with rate limits
4. Return result

### query_price
- Public CoinGecko API (no key required, key optional for higher limits)
- Fetch `api.coingecko.com/api/v3/simple/price`
- Return `{ token, price, currency }`

## 4. Security

- Private keys extracted from vault only during signing, scoped to adapter call
- Spend tracked after successful transactions
- API keys never returned in tool responses

## 5. Build Fix

- Replace tsc build with esbuild script (tsc OOMs on viem types)
- `scripts/build.sh` transpiles both packages

## 6. Testing

- Rules enforcement: deny deploy, deny over limit, deny blacklisted contract
- Success paths: mock EvmAdapter (no real txs in tests)
- API proxy: mock fetch, test rate limiting, test missing API key
