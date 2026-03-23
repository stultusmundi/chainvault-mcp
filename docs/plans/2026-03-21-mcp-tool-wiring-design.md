# MCP Tool Wiring (Tier 1) — Design Document

**Date:** 2026-03-21
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

Wire 9 MCP tool stubs to their backend modules. Tier 1 covers read-only chain tools, agent self-discovery tools, and the Solidity compiler. Write operations (deploy, interact) and API proxy tools are deferred to Tier 2.

## 2. Agent Context

- `CHAINVAULT_VAULT_KEY` env var provides the agent's vault key at server startup
- `ChainVaultServer` reads it, opens agent vault once, caches config + `RulesEngine`
- One server instance = one agent (matches MCP client launch pattern)
- If no vault key: chain registry and compile tools still work; vault-dependent tools return error

## 3. Tool Wiring

Every handler: validate input → check rules → build adapter → call backend → return JSON.

| Tool | Backend | Rules Check |
|------|---------|-------------|
| `get_balance` | `EvmAdapter.getBalance()` | chain access |
| `get_contract_state` | `EvmAdapter.readContract()` | chain access |
| `get_transaction` | `EvmAdapter.getTransaction()` | chain access |
| `get_events` | `EvmAdapter.getEvents()` | chain access |
| `simulate_transaction` | `EvmAdapter.simulateTransaction()` | chain access |
| `list_chains` | Agent config `chains[]` | none |
| `list_capabilities` | Agent config summary | none |
| `get_agent_address` | Agent vault keys (public addr only) | none |
| `compile_contract` | `compile()` | none |

## 4. Compiler Docker Setup

- CLI command: `chainvault solc pull [version]` — pulls `ethereum/solc:<version>`
- Default version: `0.8.20`
- Tool tries Docker first, falls back to local `solc`, fails with clear error

## 5. Error Handling

- Missing vault key → clear error message
- Unauthorized chain → rules engine denial message
- RPC failure → chain connection error with chain ID
- Compiler unavailable → instruction to run `chainvault solc pull`

## 6. Testing

- InMemoryTransport-based tests (existing pattern)
- Success + rules-denied paths per tool
- Mock EvmAdapter (no real RPCs)
- Mock compile() for compiler tool
- Agent context: with key, without key, invalid key
