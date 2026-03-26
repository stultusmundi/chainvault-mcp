import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, decrypt, generateVaultKeyString, wipeBuffer } from './crypto.js';
import { AgentVaultDataSchema, type AgentVaultData, type AgentConfig } from './types.js';
import type { MasterVault } from './master-vault.js';

const AGENTS_DIR = 'agents';

export class AgentVaultManager {
  private basePath: string;
  private masterVault: MasterVault;

  constructor(basePath: string, masterVault: MasterVault) {
    this.basePath = basePath;
    this.masterVault = masterVault;
  }

  async createAgent(
    config: AgentConfig,
    grantedKeys: string[],
    grantedApiKeys: string[],
  ): Promise<{ vaultKey: string }> {
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

    const agentsDir = join(this.basePath, AGENTS_DIR);
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, `${config.name}.vault`), encrypted, 'utf8');
    wipeBuffer(keyBuffer);

    return { vaultKey: keyString };
  }

  async openAgentVault(
    agentName: string,
    vaultKey: string,
  ): Promise<AgentVaultData> {
    const hexPart = vaultKey.replace('cv_agent_', '');
    const keyBuffer = Buffer.from(hexPart, 'hex');

    const encrypted = await readFile(
      join(this.basePath, AGENTS_DIR, `${agentName}.vault`),
      'utf8',
    );
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

    await writeFile(
      join(this.basePath, AGENTS_DIR, `${agentName}.vault`),
      encrypted,
      'utf8',
    );
    wipeBuffer(keyBuffer);

    return { vaultKey: keyString };
  }

  async revokeAgent(agentName: string): Promise<void> {
    const vaultPath = join(this.basePath, AGENTS_DIR, `${agentName}.vault`);
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
