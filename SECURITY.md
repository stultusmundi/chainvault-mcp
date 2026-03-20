# Security Policy

ChainVault MCP is a key management and vault encryption project. Security is foundational to its design.

## Security Model

- **Zero-knowledge agents** — agents never see raw private keys or API keys
- **AES-256-GCM encryption** — all secrets encrypted at rest with authenticated encryption
- **Rules before decryption** — the rules engine evaluates requests before any secret is decrypted; denied requests have zero secret exposure
- **Defense in depth** — rules block + vault isolation; compromising one agent vault does not expose others

## Reporting Vulnerabilities

**Do NOT report security vulnerabilities via public GitHub issues.**

Use [GitHub Security Advisories](https://github.com/stultusmundi/chainvault-mcp/security/advisories/new) to report vulnerabilities privately.

When reporting, please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Scope

The following are considered security vulnerabilities:

- Vault encryption bypass or weakening
- Private key or API key exposure through any channel (logs, error messages, MCP tool responses, TUI output)
- Rules engine circumvention (accessing chains, exceeding limits, or performing actions that should be denied)
- Injection attacks via MCP tool inputs that lead to unauthorized operations
- Authentication bypass (vault unlock without correct password/passkey)
- Agent vault isolation failure (one agent accessing another agent's secrets)

## Out of Scope

- Known limitations documented in design docs
- Social engineering attacks
- Denial of service against the local process
- Vulnerabilities in upstream dependencies (report these to the respective projects)
- Issues requiring physical access to the machine where the vault is stored

## Response

- **Acknowledgment** within 72 hours
- **Initial assessment** within 7 days
- We will work with the reporter on developing and testing a fix
- Security fixes will be released as patch versions with a security advisory

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
