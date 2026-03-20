import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DualKeyManager } from './dual-key.js';

describe('DualKeyManager', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-dualkey-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('initializes with password and retrieves master key', async () => {
    const manager = new DualKeyManager(testDir);
    await manager.initWithPassword('my-password');
    const key = await manager.unlockWithPassword('my-password');
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('fails unlock with wrong password', async () => {
    const manager = new DualKeyManager(testDir);
    await manager.initWithPassword('correct');
    await expect(manager.unlockWithPassword('wrong')).rejects.toThrow();
  });

  it('adds passkey and unlocks with it', async () => {
    const manager = new DualKeyManager(testDir);
    await manager.initWithPassword('my-password');

    const credentialId = Buffer.from('fake-credential-id-for-testing-purposes');
    const masterKeyFromPassword = await manager.unlockWithPassword('my-password');

    await manager.addPasskey(credentialId, masterKeyFromPassword);

    const masterKeyFromPasskey = await manager.unlockWithPasskey(credentialId);
    expect(masterKeyFromPasskey.equals(masterKeyFromPassword)).toBe(true);
  });

  it('password still works after passkey added', async () => {
    const manager = new DualKeyManager(testDir);
    await manager.initWithPassword('my-password');

    const credentialId = Buffer.from('test-credential');
    const masterKey = await manager.unlockWithPassword('my-password');
    await manager.addPasskey(credentialId, masterKey);

    const key2 = await manager.unlockWithPassword('my-password');
    expect(key2.equals(masterKey)).toBe(true);
  });

  it('hasPasskey returns false initially', () => {
    const manager = new DualKeyManager(testDir);
    expect(manager.hasPasskey()).toBe(false);
  });

  it('hasPasskey returns true after registration', async () => {
    const manager = new DualKeyManager(testDir);
    await manager.initWithPassword('pw');
    const key = await manager.unlockWithPassword('pw');
    await manager.addPasskey(Buffer.from('cred'), key);
    expect(manager.hasPasskey()).toBe(true);
  });
});
