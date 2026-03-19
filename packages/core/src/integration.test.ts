import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault } from './vault/master-vault.js';
import { AgentVaultManager } from './vault/agent-vault.js';
import { RulesEngine } from './rules/engine.js';
import { AuditLogger } from './audit/logger.js';
import type { AgentConfig } from './vault/types.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_PASSWORD = 'integration-test-password';

describe('Integration: Full Agent Flow', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-integration-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('complete flow: init → add key → create agent → open vault → check rules → audit', async () => {
    // 1. Admin initializes vault
    await MasterVault.init(testDir, TEST_PASSWORD);

    // 2. Admin unlocks and adds a key + API key
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('deployer-key', TEST_PRIVATE_KEY, [11155111]);
    await vault.addApiKey('etherscan', 'TEST_API_KEY', 'https://api-sepolia.etherscan.io');
    await vault.addRpcEndpoint('sepolia', 'https://rpc.sepolia.org', 11155111);

    // 3. Admin creates an agent with limited permissions
    const agentConfig: AgentConfig = {
      name: 'test-agent',
      chains: [11155111],
      tx_rules: {
        allowed_types: ['deploy', 'write', 'read', 'simulate'],
        limits: {
          '11155111': { max_per_tx: '1.0', daily_limit: '5.0', monthly_limit: '30.0' },
        },
      },
      api_access: {
        etherscan: {
          allowed_endpoints: ['getabi', 'getsourcecode'],
          rate_limit: { per_second: 5, daily: 1000 },
        },
      },
      contract_rules: { mode: 'none' },
    };

    const manager = new AgentVaultManager(testDir, vault);
    const { vaultKey } = await manager.createAgent(agentConfig, ['deployer-key'], ['etherscan']);
    vault.lock();

    // 4. Agent opens its vault (no master vault needed)
    const agentData = await manager.openAgentVault('test-agent', vaultKey);
    expect(agentData.agent_name).toBe('test-agent');
    expect(Object.keys(agentData.keys)).toEqual(['deployer-key']);
    expect(Object.keys(agentData.api_keys)).toEqual(['etherscan']);
    expect(Object.keys(agentData.rpc_endpoints)).toEqual(['sepolia']);

    // 5. Rules engine checks requests
    const rules = new RulesEngine(agentData.config);

    // Approved: deploy on Sepolia
    const deployResult = rules.checkTxRequest({ type: 'deploy', chain_id: 11155111, value: '0.5' });
    expect(deployResult.approved).toBe(true);

    // Denied: deploy on mainnet (not in chains)
    const mainnetResult = rules.checkTxRequest({ type: 'deploy', chain_id: 1, value: '0' });
    expect(mainnetResult.approved).toBe(false);

    // Denied: exceed per-tx limit
    const overLimitResult = rules.checkTxRequest({ type: 'write', chain_id: 11155111, value: '1.5' });
    expect(overLimitResult.approved).toBe(false);

    // Approved: API request
    const apiResult = rules.checkApiRequest({ service: 'etherscan', endpoint: 'getabi' });
    expect(apiResult.approved).toBe(true);

    // Denied: wrong API endpoint
    const apiDenied = rules.checkApiRequest({ service: 'etherscan', endpoint: 'sendrawtransaction' });
    expect(apiDenied.approved).toBe(false);

    // 6. Audit logger records everything
    const logger = new AuditLogger(testDir);
    await logger.log({ agent: 'test-agent', action: 'deploy_contract', chain_id: 11155111, status: 'approved', details: 'test deploy' });
    await logger.log({ agent: 'test-agent', action: 'deploy_contract', chain_id: 1, status: 'denied', details: 'chain not allowed' });

    const allEntries = await logger.getEntries();
    expect(allEntries).toHaveLength(2);

    const deniedEntries = await logger.getEntries({ status: 'denied' });
    expect(deniedEntries).toHaveLength(1);
  });

  it('agent vault key rotation invalidates old key', async () => {
    await MasterVault.init(testDir, TEST_PASSWORD);
    const vault = await MasterVault.unlock(testDir, TEST_PASSWORD);
    await vault.addKey('key1', TEST_PRIVATE_KEY, [1]);

    const config: AgentConfig = {
      name: 'rotate-test',
      chains: [1],
      tx_rules: { allowed_types: ['read'], limits: {} },
      api_access: {},
      contract_rules: { mode: 'none' },
    };

    const manager = new AgentVaultManager(testDir, vault);
    const { vaultKey: oldKey } = await manager.createAgent(config, ['key1'], []);
    const { vaultKey: newKey } = await manager.rotateAgentKey('rotate-test', oldKey);

    // New key works
    const data = await manager.openAgentVault('rotate-test', newKey);
    expect(data.agent_name).toBe('rotate-test');

    // Old key fails
    await expect(manager.openAgentVault('rotate-test', oldKey)).rejects.toThrow();

    vault.lock();
  });
});
