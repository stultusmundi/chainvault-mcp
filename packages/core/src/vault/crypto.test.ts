import { describe, it, expect } from 'vitest';
import {
  deriveKeyFromPassword,
  encrypt,
  decrypt,
  generateRandomKey,
  generateVaultKeyString,
} from './crypto.js';

describe('deriveKeyFromPassword', () => {
  it('derives a 256-bit key from password and salt', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key = await deriveKeyFromPassword('my-password', salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32); // 256 bits
  });

  it('derives the same key for the same password and salt', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key1 = await deriveKeyFromPassword('my-password', salt);
    const key2 = await deriveKeyFromPassword('my-password', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('derives different keys for different passwords', async () => {
    const salt = Buffer.from('test-salt-16bytes');
    const key1 = await deriveKeyFromPassword('password-1', salt);
    const key2 = await deriveKeyFromPassword('password-2', salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it('derives different keys for different salts', async () => {
    const salt1 = Buffer.from('salt-aaaaaaaaaa');
    const salt2 = Buffer.from('salt-bbbbbbbbbb');
    const key1 = await deriveKeyFromPassword('same-password', salt1);
    const key2 = await deriveKeyFromPassword('same-password', salt2);
    expect(key1.equals(key2)).toBe(false);
  });
});

describe('encrypt / decrypt', () => {
  it('encrypts and decrypts data round-trip', () => {
    const key = Buffer.alloc(32, 0xab);
    const plaintext = JSON.stringify({ secret: 'my-private-key' });
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypted output differs from plaintext', () => {
    const key = Buffer.alloc(32, 0xcd);
    const plaintext = 'hello world';
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const key = Buffer.alloc(32, 0xef);
    const plaintext = 'same data';
    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('fails to decrypt with wrong key', () => {
    const key1 = Buffer.alloc(32, 0x11);
    const key2 = Buffer.alloc(32, 0x22);
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('fails to decrypt tampered data', () => {
    const key = Buffer.alloc(32, 0x33);
    const encrypted = encrypt('secret', key);
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

describe('generateRandomKey', () => {
  it('generates a 32-byte random key', () => {
    const key = generateRandomKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('generates unique keys each time', () => {
    const key1 = generateRandomKey();
    const key2 = generateRandomKey();
    expect(key1.equals(key2)).toBe(false);
  });
});

describe('generateVaultKeyString', () => {
  it('generates a string starting with cv_agent_', () => {
    const { keyString } = generateVaultKeyString();
    expect(keyString).toMatch(/^cv_agent_[a-f0-9]{64}$/);
  });

  it('returns the raw key bytes as second element', () => {
    const { keyString, keyBuffer } = generateVaultKeyString();
    const hexPart = keyString.replace('cv_agent_', '');
    expect(keyBuffer.toString('hex')).toBe(hexPart);
  });
});
