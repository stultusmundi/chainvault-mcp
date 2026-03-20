# Comprehensive E2E Testing — Design Document

**Date:** 2026-03-20
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

Three testing pillars covering every non-spending user flow in ChainVault MCP:

1. **TUI E2E Tests** — 160+ tests driving Ink components with `ink-testing-library`, using real vault operations against temp directories
2. **MCP Server Integration Tests** — 25+ tests connecting via `@modelcontextprotocol/sdk` Client to the ChainVaultServer in-process
3. **Claude SDK Agent Scripts** — 2 scripts using `@anthropic-ai/claude-code` to test real AI-driven MCP tool usage (compile token, discover chains)

## 2. TUI E2E Tests

### Stack
- `ink-testing-library` for rendering Ink components and sending keystrokes
- Real `MasterVault` / `AgentVaultManager` / `AuditStore` against temp directories
- `vitest` as test runner
- No mocks — real vault encryption, real persistence

### Test Files & Coverage

#### `PasswordPrompt.e2e.test.ts` (~10 tests)
- Renders dual-prompt when hasPasskey=true (P/T options)
- Renders password-only when hasPasskey=false
- P key triggers onPasskeyRequest callback
- T key switches to password mode
- Typing renders asterisks (masked)
- Backspace removes characters
- Enter with empty password shows validation error
- Enter with password calls onSubmit with correct value
- Modifier keys (ctrl, meta) don't input characters
- Error prop displays error message

#### `MainMenu.e2e.test.ts` (~10 tests)
- Renders all 6 menu items
- Shows key/agent counts in header
- Arrow down moves selection
- Arrow up wraps from top to bottom
- Enter on each item calls onSelect with correct screen value
- q key exits
- Initial selection is first item

#### `KeysScreen.e2e.test.ts` (~25 tests)
- List: shows keys with addresses and chains
- List: arrow navigation highlights correctly
- Add flow: a → name → private key → chains → key appears
- Add flow: empty name → validation error
- Add flow: empty private key → validation error
- Add flow: invalid chains → validation error
- Add flow: Esc during add → returns to list, no mutation
- Delete flow: d → confirm y → key removed
- Delete flow: d → confirm n → key preserved
- Callback verification: onAddKey called with correct args
- Callback verification: onRemoveKey called with correct name
- Full roundtrip: real vault init → add key → verify persists → remove → verify gone
- Multiple keys: add 3 keys, navigate, delete middle one
- Private key masking: never appears in rendered output

#### `AgentsScreen.e2e.test.ts` (~25 tests)
- List: shows agents with chains and tx types
- Create: a → name → chains → types → vault key shown
- Create: vault key format is cv_agent_[64 hex chars]
- Create: "any key" after vault key → back to list
- Create: empty name → error
- Create: invalid chains → error
- Create: invalid tx types → error
- Revoke: d → confirm y → agent removed
- Revoke: d → confirm n → agent preserved
- Full roundtrip: real vault → create agent → vault file exists → revoke → file gone
- Agent persists in master vault after creation
- Multiple agents: create 3, revoke 1, verify remaining 2

#### `ServicesScreen.e2e.test.ts` (~25 tests)
- API section: shows API keys with base URLs
- RPC section: shows RPC endpoints with chain IDs
- Tab toggles between API and RPC sections
- Add API key: a → name → key (masked) → URL → appears in list
- Add RPC endpoint: Tab → a → name → URL → chain ID → appears
- Delete API key: d → confirm y → removed
- Delete RPC: Tab → d → confirm y → removed
- Validation: empty name, empty URL, invalid chain ID
- API key value never visible in rendered output
- Full roundtrip: real vault → add API key + RPC → verify persists → remove both

#### `LogsScreen.e2e.test.ts` (~20 tests)
- Renders entries with timestamps, agents, actions
- Green indicator for approved, red for denied
- Filter f cycles: all → approved → denied → all
- Only approved entries shown when filtered
- Only denied entries shown when filtered
- Arrow scroll changes visible entries
- Correct page count display
- Empty log shows appropriate message
- Full roundtrip: real AuditStore → add 20 entries → verify display → filter → scroll

#### `RulesScreen.e2e.test.ts` (~25 tests)
- Agent selection: lists agents, Enter selects
- Edit menu: shows 4 options (Chains, Types, Limits, Back)
- Edit chains: type new IDs → saved to vault
- Edit chains: invalid IDs → error, not saved
- Edit tx types: type new types → validated → saved
- Edit tx types: invalid type → error
- Edit limits: chainId:maxPerTx:daily:monthly format → parsed → saved
- Edit limits: malformed → error
- Back from edit menu → agent selection
- Esc from agent selection → onBack
- Full roundtrip: real vault → create agent → edit chains → verify in vault → edit types → verify → edit limits → verify
- Success message shown after save

#### `App.e2e.test.ts` (~20 tests)
- Full journey: password → menu → Keys → add key → back → Agents → create → back
- Wrong password shows error
- Correct password unlocks, shows menu
- Each menu item navigates to correct screen
- Esc from any screen returns to menu
- Vault persistence: add key → verify present after re-render
- Key/agent counts update in menu after mutations
- Error display and clearing

## 3. MCP Server Integration Tests

### Stack
- `@modelcontextprotocol/sdk` Client + InMemoryTransport (or StreamTransport)
- In-process ChainVaultServer (no subprocess needed)
- `vitest` as test runner

### `mcp-integration.e2e.test.ts` (~25 tests)

**Tool Discovery:**
- Client connects, listTools() returns all 19 tools
- Each tool has title, description, inputSchema
- Tool names match expected list

**list_supported_chains:**
- No args → returns all 14 chains
- network: 'mainnet' → only mainnets
- network: 'testnet' → only testnets
- Response has chainId, name, nativeCurrency, hasWebSocket, hasFaucet
- Every chain has blockExplorer

**request_faucet:**
- Testnet chain → structured result with chainId, chainName
- Mainnet chain → error about mainnet
- Unknown chain → error about unsupported

**compile_contract (if solc available):**
- Valid Solidity source → ABI + bytecode
- Invalid source → compilation error
- Wrong contract name → error

**Stub tools (vault/chain/proxy):**
- Calling stub tools returns without error (empty response)
- Input validation works (wrong types rejected)

**Error handling:**
- Invalid tool arguments → validation error

## 4. Claude SDK Agent Scripts

### Stack
- `@anthropic-ai/claude-code` SDK
- `CLAUDE_CODE_OAUTH_TOKEN` environment variable
- ChainVault MCP server spawned as subprocess via SDK's mcpServers config

### `tests/agent-e2e/compile-token.ts`

Embedded HelloToken.sol (~25 lines, minimal ERC-20):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract HelloToken {
    string public name = "HelloToken";
    string public symbol = "HELLO";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(uint256 _supply) { totalSupply = _supply; balanceOf[msg.sender] = _supply; }
    function transfer(address to, uint256 amount) external returns (bool) { ... }
    function approve(address spender, uint256 amount) external returns (bool) { ... }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { ... }
}
```

Flow:
1. Check prerequisites (CLAUDE_CODE_OAUTH_TOKEN, solc)
2. Configure Claude SDK with ChainVault MCP server
3. Send prompt: "Use compile_contract to compile this token: [source]"
4. Collect response messages
5. Verify compile_contract was called
6. Verify ABI contains transfer, approve, transferFrom, balanceOf
7. Verify bytecode is non-empty hex
8. Log results

### `tests/agent-e2e/chain-discovery.ts`

Flow:
1. Configure Claude SDK with ChainVault MCP server
2. Send prompt: "What testnet chains are available? Which have faucets? Use the MCP tools."
3. Verify list_supported_chains was called
4. Verify response mentions real chains (Sepolia, Arbitrum Sepolia, etc.)
5. Log results

Both scripts: skip gracefully with message if prerequisites missing.

## 5. Dependencies to Add

- `ink-testing-library` — devDependency in packages/cli
- `@anthropic-ai/claude-code` — devDependency in root

## 6. File Structure

```
packages/
  cli/
    src/tui/
      components/
        PasswordPrompt.e2e.test.ts
        MainMenu.e2e.test.ts
      screens/
        KeysScreen.e2e.test.ts
        AgentsScreen.e2e.test.ts
        ServicesScreen.e2e.test.ts
        LogsScreen.e2e.test.ts
        RulesScreen.e2e.test.ts
      App.e2e.test.ts
  core/
    src/mcp/
      mcp-integration.e2e.test.ts

tests/
  agent-e2e/
    compile-token.ts
    chain-discovery.ts
    HelloToken.sol
```
