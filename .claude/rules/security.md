---
paths:
  - "packages/core/src/vault/**"
  - "packages/core/src/chain/**"
  - "packages/core/src/mcp/**"
---

# Security Rules

YOU MUST follow these rules when modifying vault, chain, or MCP code:

- Never log, return, or include private keys or API keys in any output
- Wipe secrets from memory after use (set to null, fill buffers with zeros)
- Validate all inputs with Zod before processing
- Use `createCipheriv`/`createDecipheriv` with explicit auth tag length — never shortcut
- All chain write operations must pass through the rules engine first
- Never expose vault internals (encryption keys, salt, raw vault data) through MCP tools
