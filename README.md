# ChainVault MCP

**Your AI agent gets blockchain superpowers without ever touching a private key.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)
![Tests: 427 passing](https://img.shields.io/badge/Tests-427%20passing-brightgreen.svg)

ChainVault MCP is a secure [Model Context Protocol](https://modelcontextprotocol.io/) server that acts as a gateway between AI agents and EVM blockchains. It provides vault-based key management, rule-enforced access control, and API proxying -- so your agent can deploy contracts, read chain state, and query block explorers without direct access to any secret.

## Architecture

```
+----------------+     MCP (stdio)      +------------------------------------------+
|   AI Agent     |<-------------------->|            ChainVault MCP                |
|  (Claude,      |  Tools: deploy,      |                                          |
|   GPT, etc.)   |  read, simulate...   |  +---------+  +----------+  +--------+  |
+----------------+                      |  |  Rules   |  |  Vault   |  | Audit  |  |
                                        |  |  Engine  |  | Manager  |  | Logger |  |
                                        |  +----+-----+  +----+-----+  +--------+  |
                                        |       |  deny?       | decrypt           |
                                        |       v              v                   |
                                        |  +---------+  +----------+              |
                                        |  |  Chain   |  |   API    |              |
                                        |  | Adapter  |  |  Proxy   |              |
                                        |  +----+-----+  +----+-----+              |
                                        +-------+-----------+-+--------------------+
                                                |             |
                                                v             v
                                           EVM RPCs     Block Explorer APIs
                                          (Ethereum,    (Etherscan, etc.)
                                           Sepolia...)
```

## Why ChainVault?

**The problem:** Giving an AI agent a private key is like giving a stranger your house keys. One prompt injection, one hallucination, one misconfigured tool -- and your funds are gone.

**The solution:** ChainVault uses a **zero-knowledge agent architecture**:

| Without ChainVault | With ChainVault |
|---|---|
| Private key in env var or prompt | Private key encrypted in vault, never exposed |
| Agent has unlimited access | Rules engine enforces chain, tx type, and spend limits |
| No audit trail | Every action logged (approved and denied) |
| API keys in plaintext | API keys encrypted with same vault treatment |
| No rate limiting | Per-second and daily rate limits on API calls |

**The agent never sees a private key.** It holds a vault key (an AES encryption key to its own isolated vault), not a blockchain private key. Even if the agent is compromised, it can only perform actions within its pre-configured rules.

## Quick Start

```bash
npm install -g chainvault-mcp
chainvault init                       # create master vault (prompted for password)
chainvault key add my-wallet          # prompted for private key, never in args
chainvault agent create deployer      # interactive setup via TUI
chainvault serve                      # start MCP server
```

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "chainvault": {
      "command": "chainvault",
      "args": ["serve"],
      "env": {
        "CHAINVAULT_VAULT_KEY": "cv_agent_<your-agent-vault-key>"
      }
    }
  }
}
```

## Supported Chains

14 EVM chains with built-in public RPCs (via [PublicNode](https://publicnode.com/)) -- no API key required.

| Chain | ID | Type | Currency | Faucet |
|---|---|---|---|---|
| Ethereum Mainnet | `1` | Mainnet | ETH | -- |
| Sepolia | `11155111` | Testnet | ETH | [Available](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) |
| Polygon | `137` | Mainnet | POL | -- |
| Polygon Amoy | `80002` | Testnet | POL | [Available](https://faucet.polygon.technology) |
| Arbitrum One | `42161` | Mainnet | ETH | -- |
| Arbitrum Sepolia | `421614` | Testnet | ETH | [Available](https://faucet.quicknode.com/arbitrum/sepolia) |
| Optimism | `10` | Mainnet | ETH | -- |
| Optimism Sepolia | `11155420` | Testnet | ETH | [Available](https://app.optimism.io/faucet) |
| Base | `8453` | Mainnet | ETH | -- |
| Base Sepolia | `84532` | Testnet | ETH | [Available](https://app.optimism.io/faucet) |
| BNB Smart Chain | `56` | Mainnet | BNB | -- |
| BSC Testnet | `97` | Testnet | BNB | [Available](https://www.bnbchain.org/en/testnet-faucet) |
| Avalanche C-Chain | `43114` | Mainnet | AVAX | -- |
| Avalanche Fuji | `43113` | Testnet | AVAX | [Available](https://core.app/tools/testnet-faucet/?subnet=c&token=c) |

## MCP Tools

19 tools across 5 categories. All tools return structured JSON, never raw RPC responses.

### Contract Lifecycle

| Tool | Description |
|---|---|
| `deploy_contract` | Deploy compiled bytecode to a blockchain |
| `interact_contract` | Call a state-changing function on a deployed contract |
| `verify_contract` | Verify source code on a block explorer (Etherscan, etc.) |
| `compile_contract` | Compile Solidity source code using solc |

### Chain Reading

| Tool | Description |
|---|---|
| `get_balance` | Get native token balance for an address |
| `get_contract_state` | Call read-only functions on a smart contract |
| `simulate_transaction` | Dry-run a transaction without sending |
| `get_events` | Query contract event logs with filters |
| `get_transaction` | Get transaction details and receipt by hash |

### Vault Management

| Tool | Description |
|---|---|
| `list_chains` | Show which chains this agent has access to |
| `list_capabilities` | Show allowed actions, tx types, and limits |
| `get_agent_address` | Get wallet address for a chain (public key only) |

### API Proxy

| Tool | Description |
|---|---|
| `query_explorer` | Query block explorer APIs (Etherscan, etc.) |
| `query_price` | Get token price data from CoinGecko |

### Chain Registry

| Tool | Description |
|---|---|
| `list_supported_chains` | List all supported chains with RPC and faucet status |
| `request_faucet` | Request testnet tokens from a faucet |

## TUI

Running `chainvault` with no arguments launches an interactive terminal UI built with Ink (React for CLI). The TUI provides six screens: **Dashboard** (vault status, active agents, recent activity), **Keys** (add, remove, view wallet addresses), **Agents** (create, configure permissions, rotate keys, revoke), **Services** (manage API keys and RPC endpoints), **Logs** (live audit log, filterable by agent and status), and **Rules** (edit agent rules with guided prompts). All secret inputs are prompted interactively and never appear in shell history.

## Security Model

- **Zero-knowledge agent** -- the agent never sees any raw secret
- **Least privilege** -- each agent gets only the keys and permissions it needs
- **Defense in depth** -- rules engine blocks + vault doesn't contain unauthorized keys (double barrier)
- **Instant revocation** -- rotate or delete a vault key and the agent is locked out immediately

### Threat Model

| Threat | Mitigation |
|---|---|
| Prompt injection extracts keys | Keys never in agent context -- vault returns results, not secrets |
| Agent tries unauthorized chain | Rules engine denies before vault decryption + key not in vault |
| Agent exceeds spending limits | Per-tx, daily, and monthly spend tracking with hard caps |
| Compromised agent vault key | Rotate key instantly; old key becomes useless. Limited blast radius |
| API key abuse | Rate limiting, endpoint whitelisting, per-agent usage tracking |

See [SECURITY.md](./SECURITY.md) for the full security model.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing, and contribution guidelines.

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE)
