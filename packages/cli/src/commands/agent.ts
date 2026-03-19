import { MasterVault, AgentVaultManager } from '@chainvault/core';
import type { AgentConfig } from '@chainvault/core';

export async function createAgent(
  basePath: string,
  password: string,
  config: AgentConfig,
  grantedKeys: string[],
  grantedApiKeys: string[],
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    const result = await manager.createAgent(config, grantedKeys, grantedApiKeys);
    return `Agent '${config.name}' created.\nVault Key: ${result.vaultKey}\n\nSave this key — it cannot be retrieved later.`;
  } finally {
    vault.lock();
  }
}

export async function listAgents(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    const agents = manager.listAgents();
    if (agents.length === 0) return 'No agents configured.';
    return agents
      .map((a) => `${a.name}: chains=[${a.chains.join(',')}] types=[${a.allowed_types.join(',')}]`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function revokeAgent(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    await manager.revokeAgent(name);
    return `Agent '${name}' revoked and vault deleted`;
  } finally {
    vault.lock();
  }
}
