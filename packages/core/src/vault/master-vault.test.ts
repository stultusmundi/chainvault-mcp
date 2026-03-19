import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './master-vault.js';

describe('MasterVault', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('init', () => {
    it('creates a new master vault file', async () => {
      await MasterVault.init(testDir, 'test-password');
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'master.vault'))).toBe(true);
    });

    it('throws if vault already exists', async () => {
      await MasterVault.init(testDir, 'test-password');
      await expect(MasterVault.init(testDir, 'test-password')).rejects.toThrow(
        'already exists',
      );
    });
  });

  describe('unlock / lock', () => {
    it('unlocks with correct password', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      expect(vault.isUnlocked()).toBe(true);
    });

    it('fails to unlock with wrong password', async () => {
      await MasterVault.init(testDir, 'test-password');
      await expect(
        MasterVault.unlock(testDir, 'wrong-password'),
      ).rejects.toThrow();
    });

    it('lock clears sensitive data', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      vault.lock();
      expect(vault.isUnlocked()).toBe(false);
    });

    it('operations fail after lock', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      vault.lock();
      expect(() => vault.listKeys()).toThrow('Vault is locked');
    });
  });

  describe('key management', () => {
    it('adds and lists a key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1, 11155111]);
      const keys = vault.listKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe('my-wallet');
      expect(keys[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      // Private key should NOT be in the list output
      expect(keys[0]).not.toHaveProperty('private_key');
    });

    it('removes a key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1]);
      await vault.removeKey('my-wallet');
      expect(vault.listKeys()).toHaveLength(0);
    });

    it('persists keys across unlock cycles', async () => {
      await MasterVault.init(testDir, 'test-password');
      let vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addKey('my-wallet', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', [1]);
      vault.lock();

      vault = await MasterVault.unlock(testDir, 'test-password');
      expect(vault.listKeys()).toHaveLength(1);
    });
  });

  describe('API key management', () => {
    it('adds and lists an API key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
      const apiKeys = vault.listApiKeys();
      expect(apiKeys).toHaveLength(1);
      expect(apiKeys[0].name).toBe('etherscan');
      // Actual key should NOT be in the list output
      expect(apiKeys[0]).not.toHaveProperty('key');
    });

    it('removes an API key', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
      await vault.removeApiKey('etherscan');
      expect(vault.listApiKeys()).toHaveLength(0);
    });
  });

  describe('RPC endpoint management', () => {
    it('adds and lists an RPC endpoint', async () => {
      await MasterVault.init(testDir, 'test-password');
      const vault = await MasterVault.unlock(testDir, 'test-password');
      await vault.addRpcEndpoint('mainnet', 'https://mainnet.infura.io/v3/KEY', 1);
      const endpoints = vault.listRpcEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].name).toBe('mainnet');
      expect(endpoints[0].chain_id).toBe(1);
    });
  });
});
