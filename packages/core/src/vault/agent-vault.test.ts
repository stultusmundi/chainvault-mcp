import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './master-vault.js';
import { AgentVaultManager } from './agent-vault.js';
import type { AgentConfig } from './types.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const DEPLOYER_CONFIG: AgentConfig = {
  name: 'deployer',
  chains: [11155111],
  tx_rules: {
    allowed_types: ['deploy', 'write', 'read', 'simulate'],
    limits: {},
  },
  api_access: {
    etherscan: {
      allowed_endpoints: ['*'],
      rate_limit: { per_second: 5, daily: 5000 },
    },
  },
  contract_rules: { mode: 'none' },
};

describe('AgentVaultManager', () => {
  let testDir: string;
  let masterVault: MasterVault;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-agent-test-'));
    await MasterVault.init(testDir, 'test-password');
    masterVault = await MasterVault.unlock(testDir, 'test-password');
    await masterVault.addKey('my-wallet', TEST_PRIVATE_KEY, [1, 11155111]);
    await masterVault.addApiKey('etherscan', 'ABCDEF123', 'https://api.etherscan.io');
  });

  afterEach(async () => {
    masterVault.lock();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createAgent', () => {
    it('creates an agent vault and returns the vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      expect(result.vaultKey).toMatch(/^cv_agent_[a-f0-9]{64}$/);
    });

    it('creates the agent vault file on disk', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'agents', 'deployer.vault'))).toBe(true);
    });

    it('agent vault only contains granted keys', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(Object.keys(agentData.keys)).toEqual(['my-wallet']);
      expect(Object.keys(agentData.api_keys)).toEqual([]);
    });

    it('agent vault contains granted API keys', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, [], ['etherscan']);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(Object.keys(agentData.api_keys)).toEqual(['etherscan']);
      expect(Object.keys(agentData.keys)).toEqual([]);
    });
  });

  describe('openAgentVault', () => {
    it('opens with correct vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const agentData = await manager.openAgentVault('deployer', result.vaultKey);
      expect(agentData.agent_name).toBe('deployer');
    });

    it('fails with wrong vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await expect(
        manager.openAgentVault('deployer', 'cv_agent_0000000000000000000000000000000000000000000000000000000000000000'),
      ).rejects.toThrow();
    });
  });

  describe('rotateAgentKey', () => {
    it('returns a new vault key', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const original = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      const rotated = await manager.rotateAgentKey('deployer', original.vaultKey);
      expect(rotated.vaultKey).toMatch(/^cv_agent_[a-f0-9]{64}$/);
      expect(rotated.vaultKey).not.toBe(original.vaultKey);
    });

    it('old key no longer works after rotation', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      const original = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await manager.rotateAgentKey('deployer', original.vaultKey);
      await expect(
        manager.openAgentVault('deployer', original.vaultKey),
      ).rejects.toThrow();
    });
  });

  describe('revokeAgent', () => {
    it('deletes the agent vault file', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], []);
      await manager.revokeAgent('deployer');
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(testDir, 'agents', 'deployer.vault'))).toBe(false);
    });
  });

  describe('listAgents', () => {
    it('lists all agents with summaries', async () => {
      const manager = new AgentVaultManager(testDir, masterVault);
      await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
      const agents = manager.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('deployer');
      expect(agents[0].chains).toEqual([11155111]);
    });
  });
});
