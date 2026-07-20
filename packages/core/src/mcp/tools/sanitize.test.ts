import { describe, it, expect } from 'vitest';
import { sanitizeError } from './sanitize.js';

const PRIV = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // 64 hex
const VAULT_KEY = 'cv_agent_' + 'a'.repeat(64);
const PUBLIC_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // 40 hex — not secret

describe('sanitizeError (shared)', () => {
  it('redacts a 0x-prefixed private key', () => {
    const out = sanitizeError(new Error(`signing failed with key 0x${PRIV}`));
    expect(out).not.toContain(PRIV);
    expect(out).toContain('0x[REDACTED]');
  });

  it('redacts a bare 64-hex private key with no 0x prefix', () => {
    const out = sanitizeError(new Error(`raw key ${PRIV} leaked`));
    expect(out).not.toContain(PRIV);
    expect(out).toContain('[REDACTED]');
  });

  it('redacts a cv_agent_ vault key', () => {
    const out = sanitizeError(`bad vault key ${VAULT_KEY}`);
    expect(out).not.toContain('a'.repeat(64));
    expect(out).toContain('cv_agent_[REDACTED]');
  });

  it('redacts URLs of any scheme (embedded credentials)', () => {
    expect(sanitizeError('at https://mainnet.infura.io/v3/SECRETKEY123')).not.toContain('SECRETKEY123');
    expect(sanitizeError('at wss://node.example.com/ws/WSTOKEN')).not.toContain('WSTOKEN');
  });

  it('does not redact a public 40-hex address', () => {
    const out = sanitizeError(new Error(`revert from ${PUBLIC_ADDRESS}`));
    expect(out).toContain(PUBLIC_ADDRESS);
  });

  it('handles both Error and string inputs', () => {
    expect(sanitizeError(new Error('plain'))).toBe('plain');
    expect(sanitizeError('plain')).toBe('plain');
  });
});
