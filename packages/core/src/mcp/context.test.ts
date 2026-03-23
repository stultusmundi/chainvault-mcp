import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from '../vault/master-vault.js';
import { AgentVaultManager } from '../vault/agent-vault.js';
import type { AgentConfig } from '../vault/types.js';
import { createAgentContext } from './context.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_PASSWORD = 'test-password';

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

describe('createAgentContext', () => {
  let testDir: string;
  let vaultKey: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-context-'));
    await MasterVault.init(testDir, TEST_PASSWORD);
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('my-wallet', TEST_PRIVATE_KEY, [1, 11155111]);

    const manager = new AgentVaultManager(testDir, vault);
    const result = await manager.createAgent(DEPLOYER_CONFIG, ['my-wallet'], ['etherscan']);
    vaultKey = result.vaultKey;
    vault.lock();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates context with valid vault key', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    expect(ctx).not.toBeNull();
    expect(ctx!.agentName).toBe('deployer');
    expect(ctx!.config.chains).toEqual([11155111]);
    expect(ctx!.rules).toBeDefined();
  });

  it('context has keys with public addresses only', async () => {
    const ctx = await createAgentContext(testDir, vaultKey);
    expect(ctx!.keys).toHaveLength(1);
    expect(ctx!.keys[0].name).toBe('my-wallet');
    expect(ctx!.keys[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    // Ensure no private key is exposed in the keys array
    const keyAsAny = ctx!.keys[0] as any;
    expect(keyAsAny.private_key).toBeUndefined();
  });

  it('throws with invalid vault key', async () => {
    const badKey = 'cv_agent_0000000000000000000000000000000000000000000000000000000000000000';
    await expect(createAgentContext(testDir, badKey)).rejects.toThrow(
      'Invalid vault key',
    );
  });

  it('returns null when no vault key provided', async () => {
    const ctx = await createAgentContext(testDir, undefined);
    expect(ctx).toBeNull();
  });
});
