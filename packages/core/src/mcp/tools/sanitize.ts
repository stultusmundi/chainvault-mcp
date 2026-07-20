/**
 * Redacts secrets from error text before it reaches an agent or the audit log.
 * Shared by every MCP tool so the redaction rules never drift between copies.
 *
 * Covers:
 *  - cv_agent_ vault keys
 *  - private keys: 0x-prefixed and bare 64-hex
 *  - URLs of any scheme (http/https/ws/wss/...), which commonly embed RPC or
 *    API credentials in the path or query string
 *
 * Not covered: a bare alphanumeric API key that appears outside a URL cannot be
 * distinguished from ordinary text by pattern alone, so it is not redacted here.
 * Public 40-hex addresses are intentionally left intact.
 */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/cv_agent_[a-fA-F0-9]+/g, 'cv_agent_[REDACTED]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"')]+/gi, 'https://[REDACTED]')
    .replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED]')
    .replace(/(?<![a-fA-F0-9])[a-fA-F0-9]{64}(?![a-fA-F0-9])/g, '[REDACTED]');
}
