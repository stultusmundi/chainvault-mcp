import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, decrypt, generateVaultKeyString, wipeBuffer } from './crypto.js';
import { AGENT_NAME_PATTERN, AgentVaultDataSchema, type AgentVaultData, type AgentConfig } from './types.js';
import type { MasterVault } from './master-vault.js';

const AGENTS_DIR = 'agents';

export class AgentVaultManager {
  private basePath: string;
  private masterVault: MasterVault;

  constructor(basePath: string, masterVault: MasterVault) {
    this.basePath = basePath;
    this.masterVault = masterVault;
  }

  /**
   * Validates an agent name and returns its vault file path. Callers pass the
   * name straight in (bypassing schema validation), so this is the enforcement
   * point that prevents path traversal (arbitrary read/write/delete).
   */
  private vaultPathFor(agentName: string): string {
    if (!AGENT_NAME_PATTERN.test(agentName)) {
      throw new Error(`Invalid agent name: ${JSON.stringify(agentName)}`);
    }
    return join(this.basePath, AGENTS_DIR, `${agentName}.vault`);
  }

  async createAgent(
    config: AgentConfig,
    grantedKeys: string[],
    grantedApiKeys: string[],
  ): Promise<{ vaultKey: string }> {
    // Validate the name before any state mutation or disk write.
    const vaultPath = this.vaultPathFor(config.name);
    const masterData = this.masterVault.getData();

    // Store agent config in master vault
    masterData.agents[config.name] = config;
    await this.masterVault.saveData();

    // Build agent vault data with only granted secrets
    const keys: AgentVaultData['keys'] = {};
    for (const keyName of grantedKeys) {
      if (masterData.keys[keyName]) {
        keys[keyName] = masterData.keys[keyName];
      }
    }

    const apiKeys: AgentVaultData['api_keys'] = {};
    for (const apiKeyName of grantedApiKeys) {
      if (masterData.api_keys[apiKeyName]) {
        apiKeys[apiKeyName] = masterData.api_keys[apiKeyName];
      }
    }

    // Collect RPC endpoints matching agent's allowed chains
    const rpcEndpoints: AgentVaultData['rpc_endpoints'] = {};
    for (const [name, ep] of Object.entries(masterData.rpc_endpoints)) {
      if (config.chains.includes(ep.chain_id)) {
        rpcEndpoints[name] = ep;
      }
    }

    const agentVaultData: AgentVaultData = {
      version: 1,
      agent_name: config.name,
      config,
      keys,
      api_keys: apiKeys,
      rpc_endpoints: rpcEndpoints,
    };

    // Generate vault key and encrypt
    const { keyString, keyBuffer } = generateVaultKeyString();
    const encrypted = encrypt(JSON.stringify(agentVaultData), keyBuffer);

    await mkdir(join(this.basePath, AGENTS_DIR), { recursive: true });
    await writeFile(vaultPath, encrypted, 'utf8');
    wipeBuffer(keyBuffer);

    return { vaultKey: keyString };
  }

  async openAgentVault(
    agentName: string,
    vaultKey: string,
  ): Promise<AgentVaultData> {
    const vaultPath = this.vaultPathFor(agentName);
    const hexPart = vaultKey.replace('cv_agent_', '');
    const keyBuffer = Buffer.from(hexPart, 'hex');

    const encrypted = await readFile(vaultPath, 'utf8');
    const decrypted = decrypt(encrypted, keyBuffer);
    wipeBuffer(keyBuffer);
    return AgentVaultDataSchema.parse(JSON.parse(decrypted));
  }

  async rotateAgentKey(
    agentName: string,
    currentVaultKey: string,
  ): Promise<{ vaultKey: string }> {
    // Open with current key to get data
    const agentData = await this.openAgentVault(agentName, currentVaultKey);

    // Re-encrypt with new key
    const { keyString, keyBuffer } = generateVaultKeyString();
    const encrypted = encrypt(JSON.stringify(agentData), keyBuffer);

    await writeFile(this.vaultPathFor(agentName), encrypted, 'utf8');
    wipeBuffer(keyBuffer);

    return { vaultKey: keyString };
  }

  async regenerateAgent(
    agentName: string,
    currentVaultKey: string,
    grantedKeys: string[],
    grantedApiKeys: string[],
  ): Promise<{ vaultKey: string }> {
    // Verify old key works (proves caller has access)
    await this.openAgentVault(agentName, currentVaultKey);

    // Read updated config from master vault
    const masterData = this.masterVault.getData();
    const config = masterData.agents[agentName];
    if (!config) throw new Error(`Agent '${agentName}' not found in master vault`);

    // Build fresh agent vault data with current secrets
    const keys: AgentVaultData['keys'] = {};
    for (const keyName of grantedKeys) {
      if (masterData.keys[keyName]) keys[keyName] = masterData.keys[keyName];
    }

    const apiKeys: AgentVaultData['api_keys'] = {};
    for (const apiKeyName of grantedApiKeys) {
      if (masterData.api_keys[apiKeyName]) apiKeys[apiKeyName] = masterData.api_keys[apiKeyName];
    }

    const rpcEndpoints: AgentVaultData['rpc_endpoints'] = {};
    for (const [name, ep] of Object.entries(masterData.rpc_endpoints)) {
      if (config.chains.includes(ep.chain_id)) rpcEndpoints[name] = ep;
    }

    const agentVaultData: AgentVaultData = {
      version: 1,
      agent_name: agentName,
      config,
      keys,
      api_keys: apiKeys,
      rpc_endpoints: rpcEndpoints,
    };

    const { keyString, keyBuffer } = generateVaultKeyString();
    const encrypted = encrypt(JSON.stringify(agentVaultData), keyBuffer);
    wipeBuffer(keyBuffer);

    await writeFile(this.vaultPathFor(agentName), encrypted, 'utf8');

    return { vaultKey: keyString };
  }

  async revokeAgent(agentName: string): Promise<void> {
    const vaultPath = this.vaultPathFor(agentName);
    await rm(vaultPath, { force: true });

    const masterData = this.masterVault.getData();
    delete masterData.agents[agentName];
    await this.masterVault.saveData();
  }

  listAgents(): Array<{ name: string; chains: number[]; allowed_types: string[] }> {
    const masterData = this.masterVault.getData();
    return Object.values(masterData.agents).map((config) => ({
      name: config.name,
      chains: config.chains,
      allowed_types: config.tx_rules.allowed_types,
    }));
  }
}
