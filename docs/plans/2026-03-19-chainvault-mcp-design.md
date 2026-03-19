# ChainVault MCP — Design Document

**Date:** 2026-03-19
**Status:** Approved
**Author:** Vasilis Magkoutis

## 1. Overview

ChainVault MCP is a secure Model Context Protocol (MCP) server that acts as a gateway between AI agents and blockchains. It provides vault-based key management, rule-enforced access control, and chain interaction tools — so AI agents get blockchain superpowers without ever touching a private key.

**Target user:** AI agents that write, audit, deploy, and interact with smart contracts (via Claude Code, Cursor, or any MCP-compatible client).

**V1 scope:** EVM chains only, with a chain-agnostic adapter architecture for future expansion.

**Architecture:** Modular monolith — single TypeScript process with clean internal module boundaries (`vault/`, `chain/`, `rules/`, `proxy/`). Can be split into services later if needed.

## 2. Architecture Overview

```
+---------------------------------------------------+
|                 ChainVault MCP                     |
|              (TypeScript Process)                  |
|                                                    |
|  +----------+  +----------+  +------------------+  |
|  |  Vault   |  |  Rules   |  |     Chain        |  |
|  |  Module   |  |  Engine  |  |    Module        |  |
|  |          |  |          |  |  (EVM Adapter)   |  |
|  | - Master |  | - Chain  |  |  - Deploy        |  |
|  |   Vault  |  |   access |  |  - Interact      |  |
|  | - Agent  |  | - Spend  |  |  - Read state    |  |
|  |   Vaults |  |   limits |  |  - Simulate      |  |
|  | - API Key|  | - TX type|  |  - Events        |  |
|  |   Store  |  |   filter |  |  - Verify        |  |
|  +----+-----+  +----+-----+  +--------+---------+  |
|       |              |                 |            |
|  +----+--------------+-----------------+----------+ |
|  |             MCP Tool Interface                 | |
|  |      (What the AI agent sees & calls)          | |
|  +------------------------------------------------+ |
|                                                    |
|  +------------------------------------------------+ |
|  |           API Proxy Module                     | |
|  |   (Etherscan, CoinGecko, etc. via vault)       | |
|  |   - Rate limiting, endpoint whitelist          | |
|  +------------------------------------------------+ |
+---------------------------------------------------+
         |                            |
    +----+----+                 +-----+------+
    |Encrypted|                 |  EVM RPCs   |
    | Storage |                 |(Infura/etc.)|
    | (Disk)  |                 +-------------+
    +---------+
```

### Transaction flow

1. Agent calls an MCP tool (e.g., `deploy_contract`)
2. MCP identifies the calling agent by vault key
3. Rules engine checks: chain access? spend limits? allowed tx type?
4. If approved, vault module decrypts private key in-memory
5. Chain module signs and sends the transaction
6. Private key wiped from memory immediately
7. Result returned to agent

### API call flow

1. Agent calls a proxy tool (e.g., `query_explorer`)
2. Rules engine checks: API access? endpoint whitelist? rate limit?
3. Vault decrypts API key in-memory
4. Proxy makes HTTPS call to external service
5. Key wiped from memory
6. Structured response returned to agent

## 3. Vault & Encryption Design

### Master Vault

- Created on first setup via CLI (`chainvault init`)
- Protected by WebAuthn/Passkey (preferred) or password fallback
- Passkey derives a master key via HKDF -> AES-256-GCM encryption
- Stored as encrypted JSON blob: `~/.chainvault/master.vault`
- Contains all private keys, API keys, RPC URLs, and agent vault configurations
- Only opened through admin interface (CLI/TUI). Agents never touch it
- Auto-locks after configurable timeout (default 15 min)

### Agent Vaults

- Created via admin interface (`chainvault agent create <name>`)
- Each agent gets a random 256-bit AES-GCM key, formatted as API-key-style string (e.g., `cv_agent_a1b2c3d4...`)
- Agent vault is a filtered copy — only contains secrets the agent is allowed to access
- When permissions change, agent vault is regenerated from master vault
- Decrypted per-request: vault opens, secret extracted, operation performed, secret wiped, vault locks

### Encryption flow

```
User Passkey/Password
        |
        v
   HKDF derive
        |
        v
   Master Key (256-bit)
        |
        v
   AES-256-GCM encrypt/decrypt
        |
        v
   master.vault (disk)
        |
        |  admin creates agent
        v
   Agent Vault Key (random 256-bit)
        |
        v
   AES-256-GCM encrypt/decrypt
        |
        v
   agent-<name>.vault (disk)
```

### Key lifecycle

- Private keys decrypted in-memory only at moment of signing, then wiped
- API keys decrypted in-memory only at moment of API call, then wiped
- Agent vault keys can be rotated without affecting master vault
- Compromised agent: revoke vault key, attacker has nothing

### Storage structure

```
~/.chainvault/
  master.vault            # Encrypted master vault
  agents/
    auditor.vault         # Encrypted agent vault
    deployer.vault        # Encrypted agent vault
    reader.vault          # Encrypted agent vault
  config.json             # Non-sensitive: chain configs, public RPC endpoints, rule templates
```

## 4. Rule Engine & Access Control

Rules are defined per agent vault and stored inside the encrypted vault file.

### Rule categories

**Chain Access:**
- Whitelist of chain IDs the agent can interact with
- e.g., `[1, 11155111, 137]` = Ethereum mainnet, Sepolia, Polygon
- Double defense: rules block + key not in vault

**Transaction Limits:**
- `max_per_tx` — max value per single transaction (native token)
- `daily_limit` — max total value per 24h rolling window
- `monthly_limit` — max total value per 30d rolling window
- Limits are per-chain (mainnet $100/day, testnet unlimited)

**Transaction Type Filter:**
- Whitelist/blacklist of allowed operations: `deploy`, `write`, `transfer`, `read`, `simulate`
- `read` and `simulate` are always safe (no cost, no risk)

**API Access Rules:**
- Per-API-key endpoint whitelist
- Rate limits (per-second + daily cap)
- Acts as cost control for paid APIs

**Contract Interaction Rules (optional):**
- Whitelist/blacklist of contract addresses
- Useful for mainnet agents with narrow scope

### Example agent configuration

```json
{
  "agent": "deployer",
  "chains": [11155111],
  "tx_rules": {
    "allowed_types": ["deploy", "write", "read", "simulate"],
    "limits": {
      "11155111": {
        "max_per_tx": "unlimited",
        "daily_limit": "unlimited"
      }
    }
  },
  "api_access": {
    "etherscan": {
      "allowed_endpoints": ["*"],
      "rate_limit": { "per_second": 5, "daily": 5000 }
    }
  },
  "contract_rules": {
    "mode": "none"
  }
}
```

### Enforcement

Rules are checked BEFORE the vault decrypts any secret. A denied request has zero secret exposure.

### Audit log

Every request (approved or denied) is logged with: timestamp, agent name, action, chain, value, and result. Stored unencrypted for admin review. No secrets in logs.

## 5. MCP Tool Interface

### Contract Lifecycle

| Tool | Description | Rules Check |
|------|-------------|-------------|
| `deploy_contract` | Deploy compiled bytecode to a chain | chain access, tx type, spend limit |
| `interact_contract` | Call a write function on a deployed contract | chain access, tx type, spend limit, contract whitelist |
| `verify_contract` | Verify source code on block explorer | API access rules |

### Chain Reading

| Tool | Description | Rules Check |
|------|-------------|-------------|
| `get_balance` | Get native/token balance for an address | chain access |
| `get_contract_state` | Read public state from a contract | chain access |
| `simulate_transaction` | Simulate a tx without sending | chain access |
| `get_events` | Query contract events/logs with filters | chain access |
| `get_transaction` | Get tx details and receipt by hash | chain access |

### Vault Management (agent-facing)

| Tool | Description | Notes |
|------|-------------|-------|
| `list_chains` | Show which chains this agent has access to | No secrets exposed |
| `list_capabilities` | Show what this agent is allowed to do | Returns rules summary |
| `get_agent_address` | Get the wallet address for a given chain | Public key only |

### API Proxy

| Tool | Description | Rules Check |
|------|-------------|-------------|
| `query_explorer` | Query block explorer APIs | API rate limit, endpoint whitelist |
| `query_price` | Get token price data | API rate limit |

### Design decisions

- Tools return structured JSON, not raw RPC responses
- Every write tool returns a cost/risk summary before executing
- `simulate_transaction` encouraged before any write operation
- No tool exposes private keys, API keys, or vault internals

## 6. API Proxy Module

Sits between the agent and external services. The agent never calls external APIs directly.

### Supported services (V1)

- Block explorers: Etherscan (+ Polygonscan, Arbiscan — same API format)
- Price data: CoinGecko
- RPC endpoints: Infura, Alchemy, or any custom RPC URL

### Proxy features

- **Rate limiting** — per-agent, per-service (per-second + daily cap)
- **Endpoint whitelist** — agent can only call approved API methods
- **Response caching** — cache immutable data (contract ABIs) to reduce API calls
- **Timeout & retry** — configurable per service, with circuit breaker
- **Cost tracking** — per-agent usage tracking for admin visibility

### Adding new services

No code changes needed for standard REST APIs:
1. Add service config to master vault (API key + base URL)
2. Define default endpoint whitelist
3. Assign to agent vaults with rules

## 7. CLI & Admin Interface

### Interactive TUI (primary experience)

`chainvault` launches an interactive terminal UI (built with Ink/React for CLI):

- **Dashboard** — vault status, MCP server status, active agents, recent activity
- **Keys** — list, add, remove keys (shows addresses, never private keys)
- **Agents** — create, configure, view permissions, rotate keys, revoke
- **Services** — manage API keys, RPC endpoints
- **Logs** — live audit log, filterable by agent/action/status
- **Rules** — edit agent rules with guided prompts

### Direct CLI commands (for scripting/automation)

**Setup:**
- `chainvault init` — create master vault
- `chainvault unlock` — unlock master vault for admin session
- `chainvault lock` — lock master vault

**Key management:**
- `chainvault key add <name>` — import private key (prompted, never in args)
- `chainvault key add-seed <name>` — import from seed phrase
- `chainvault key generate <name>` — generate new keypair
- `chainvault key list` — show names + public addresses
- `chainvault key remove <name>` — remove from master vault

**API key management:**
- `chainvault api add <service>` — add API key (prompted)
- `chainvault api add rpc <name> <url>` — add RPC endpoint
- `chainvault api list` — show configured services
- `chainvault api remove <name>`

**Agent management:**
- `chainvault agent create <name>` — create agent vault, returns vault key
- `chainvault agent list` — all agents with permission summaries
- `chainvault agent show <name>` — detailed view
- `chainvault agent rotate-key <name>` — rotate vault key
- `chainvault agent revoke <name>` — revoke access immediately
- `chainvault agent delete <name>` — delete vault entirely

**Agent permissions:**
- `chainvault agent grant <name> chain <id>` — grant chain access
- `chainvault agent grant <name> key <key-name>` — copy key to agent vault
- `chainvault agent grant <name> api <service>` — grant API access
- `chainvault agent set-limit <name> <chain-id> daily <amount>`
- `chainvault agent set-limit <name> <chain-id> per-tx <amount>`
- `chainvault agent allow-tx <name> deploy,write,read`
- `chainvault agent set-api-limit <name> <service> <per-sec>/<daily>`

**Monitoring:**
- `chainvault logs` — view audit log
- `chainvault logs <agent-name>` — filter by agent
- `chainvault logs --denied` — denied requests only
- `chainvault status` — running state, connected agents, usage

**MCP server:**
- `chainvault serve` — start MCP server
- `chainvault serve --port 3000` — custom port

### Security

- Secrets never passed as CLI arguments (visible in process list/shell history)
- Always prompted interactively or piped from stdin
- Session auto-locks after configurable timeout (default 15 min)

## 8. Project Structure & Packaging

```
chainvault-mcp/
  packages/
    core/                    # Main MCP server + modules
      src/
        mcp/                 # MCP tool definitions & handler
        vault/               # Master vault, agent vaults, encryption
        chain/               # Chain adapters (EVM first)
        rules/               # Rule engine & enforcement
        proxy/               # API proxy, rate limiting, caching
        index.ts
      package.json

    cli/                     # CLI + TUI interface
      src/
        tui/                 # Interactive TUI screens (Ink)
        commands/            # Direct CLI commands
        index.ts
      package.json

  docs/
    getting-started.md
    agent-setup.md
    security-model.md
    api-reference.md

  examples/
    claude-code-setup.md
    cursor-setup.md
    agent-configs/

  package.json               # Monorepo root (npm workspaces)
  README.md
  LICENSE
```

### Packages

- `@chainvault/core` — MCP server, installable independently
- `@chainvault/cli` — TUI + CLI, depends on core

### Installation

```bash
npm install -g chainvault-mcp
chainvault                    # Launch TUI
```

### MCP client config

```json
{
  "mcpServers": {
    "chainvault": {
      "command": "chainvault",
      "args": ["serve"]
    }
  }
}
```

### V2 additions (future)

```
packages/
  analysis/                  # Docker-based Slither/Aderyn integration
  web/                       # Web admin panel
  docker/                    # Dockerfiles for analysis tools
```

## 9. Security Model

### Principles

1. **Zero-knowledge agent** — agent never sees any raw secret
2. **Least privilege** — each agent gets only what it needs
3. **Defense in depth** — rules block + vault doesn't contain unauthorized keys
4. **Secrets in memory, never in logs** — decrypted momentarily, then wiped
5. **Revocation is instant** — rotate/delete vault key, agent is locked out

### Threat model

| Threat | Mitigation |
|--------|------------|
| LLM leaks agent vault key in output | Vault key only decrypts that agent's limited vault. Rotate key, no master exposure |
| Agent tries to exceed spend limits | Rules engine rejects before vault opens |
| Agent tries unauthorized chain | Key not in vault + rules reject = double block |
| Attacker steals vault files from disk | AES-256-GCM encrypted, useless without passkey/vault key |
| Attacker steals agent vault key | Limited blast radius — only that agent's permitted secrets. Revoke and regenerate |
| Compromised API key | Per-agent API keys. Revoke one agent without affecting others |
| Admin forgets to lock | Auto-lock timeout (default 15 min) |

### Tagline

> "ChainVault MCP is the secure gateway between AI agents and blockchains. Your agent gets blockchain superpowers without ever touching a private key."

## 10. Technology Stack

- **Runtime:** Node.js / TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk` (TypeScript)
- **Encryption:** Node.js `crypto` module (AES-256-GCM, HKDF)
- **WebAuthn:** `@simplewebauthn/server` (for passkey support)
- **EVM interaction:** `ethers.js` v6 or `viem`
- **TUI:** Ink (React for CLI)
- **Monorepo:** npm workspaces
- **Future — Analysis tools:** Python (Slither), Rust binary (Aderyn), Docker containers
