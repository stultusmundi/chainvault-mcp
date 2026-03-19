# ChainVault MCP

**Your AI agent gets blockchain superpowers without ever touching a private key.**

ChainVault MCP is a secure [Model Context Protocol](https://modelcontextprotocol.io/) server that acts as a gateway between AI agents and EVM blockchains. It provides vault-based key management, rule-enforced access control, and API proxying — so your agent can deploy contracts, read chain state, and query block explorers without direct access to secrets.

## Architecture

```
┌──────────────┐     MCP (stdio)      ┌──────────────────────────────────────────┐
│   AI Agent   │◄────────────────────►│            ChainVault MCP                │
│  (Claude,    │  Tools: deploy,      │                                          │
│   GPT, etc.) │  read, simulate...   │  ┌─────────┐  ┌──────────┐  ┌────────┐ │
└──────────────┘                      │  │  Rules   │  │  Vault   │  │ Audit  │ │
                                      │  │  Engine  │  │ Manager  │  │ Logger │ │
                                      │  └────┬─────┘  └────┬─────┘  └────────┘ │
                                      │       │  deny?       │ decrypt           │
                                      │       ▼              ▼                   │
                                      │  ┌─────────┐  ┌──────────┐              │
                                      │  │  Chain   │  │   API    │              │
                                      │  │ Adapter  │  │  Proxy   │              │
                                      │  └────┬─────┘  └────┬─────┘              │
                                      └───────┼─────────────┼────────────────────┘
                                              │             │
                                              ▼             ▼
                                         EVM RPCs     Block Explorer APIs
                                        (Ethereum,    (Etherscan, etc.)
                                         Sepolia...)
```

## Why ChainVault?

**The problem:** Giving an AI agent a private key is like giving a stranger your house keys. One prompt injection, one hallucination, one misconfigured tool — and your funds are gone.

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

### Install

```bash
git clone https://github.com/stultusmundi/chainvault-mcp.git
cd chainvault-mcp
npm install
```

### Initialize a Vault

```bash
export CHAINVAULT_PASSWORD="your-secure-password"
npx chainvault init
```

### Add a Key

```bash
# Keys are prompted interactively in TUI mode
# For scripting, use the programmatic API
```

### Configure as MCP Server

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chainvault": {
      "command": "npx",
      "args": ["chainvault", "serve"],
      "env": {
        "CHAINVAULT_VAULT_KEY": "cv_agent_<your-agent-vault-key>"
      }
    }
  }
}
```

## MCP Tools

| Tool | Category | Description |
|------|----------|-------------|
| `list_chains` | Vault | Show accessible blockchain networks |
| `list_capabilities` | Vault | Show allowed actions and limits |
| `get_agent_address` | Vault | Get wallet address for a chain (public only) |
| `deploy_contract` | Chain | Deploy compiled bytecode to a blockchain |
| `interact_contract` | Chain | Call state-changing contract functions |
| `get_balance` | Chain | Get native token balance for an address |
| `get_contract_state` | Chain | Read contract view/pure functions |
| `simulate_transaction` | Chain | Dry-run a transaction without sending |
| `get_events` | Chain | Query contract event logs |
| `get_transaction` | Chain | Get transaction details and receipt |
| `verify_contract` | Chain | Verify source code on block explorer |
| `query_explorer` | Proxy | Query block explorer APIs (Etherscan, etc.) |
| `query_price` | Proxy | Get token price data |

## Security Model

ChainVault implements **defense in depth** with two independent security layers:

### Layer 1: Rules Engine
Before any vault decryption, the rules engine checks:
- **Chain access** — Is the agent allowed on this chain?
- **Transaction type** — Can it deploy, write, read, or simulate?
- **Spend limits** — Per-transaction, daily, and monthly caps
- **Contract rules** — Whitelist/blacklist target addresses
- **API access** — Which endpoints and services are allowed?

### Layer 2: Vault Isolation
Even if rules pass, the agent vault only contains secrets explicitly granted by the admin:
- Agent vaults are encrypted with unique AES-256-GCM keys
- Master vault requires a separate password
- Key rotation invalidates old vault keys instantly
- Revocation deletes the agent vault file entirely

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Prompt injection tries to extract keys | Keys never in agent context — vault returns results, not secrets |
| Agent tries unauthorized chain | Rules engine denies before vault decryption |
| Agent exceeds spending limits | Per-tx, daily, and monthly spend tracking |
| Compromised agent vault key | Key rotation + revocation; old keys instantly invalid |
| API key abuse | Rate limiting, endpoint whitelisting, usage tracking |

## Development

```bash
npm run test        # Run all tests
npm run test:watch  # Watch mode
npm run lint        # Type check
npm run build       # Build all packages
```

### Project Structure

```
chainvault-mcp/
├── packages/
│   ├── core/              # MCP server, vault, rules, chain, proxy, audit
│   │   └── src/
│   │       ├── vault/     # Encryption, master vault, agent vaults
│   │       ├── rules/     # Rule engine enforcement
│   │       ├── chain/     # ChainAdapter interface + EVM implementation
│   │       ├── proxy/     # API proxy with caching and rate limiting
│   │       ├── audit/     # Append-only audit logger
│   │       └── mcp/       # MCP server and tool definitions
│   └── cli/               # CLI commands and TUI
│       └── src/
│           └── commands/   # init, key, agent, serve
├── CLAUDE.md              # AI development guidelines
└── vitest.config.ts       # Test configuration
```

## License

MIT
