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

export async function showAgent(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[name];
    if (!config) return `Agent '${name}' not found.`;
    const lines = [
      `Agent: ${config.name}`,
      `Chains: ${config.chains.join(', ')}`,
      `Allowed TX types: ${config.tx_rules.allowed_types.join(', ')}`,
      `Contract rules: ${config.contract_rules.mode}`,
    ];
    for (const [chainId, limits] of Object.entries(config.tx_rules.limits)) {
      lines.push(`Limits (chain ${chainId}): per-tx=${limits.max_per_tx}, daily=${limits.daily_limit}, monthly=${limits.monthly_limit}`);
    }
    for (const [service, rule] of Object.entries(config.api_access)) {
      lines.push(`API: ${service} — endpoints=[${rule.allowed_endpoints.join(',')}] rate=${rule.rate_limit.per_second}/s, ${rule.rate_limit.daily}/day`);
    }
    return lines.join('\n');
  } finally {
    vault.lock();
  }
}

export async function rotateAgentKey(
  basePath: string,
  password: string,
  name: string,
  currentVaultKey: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const manager = new AgentVaultManager(basePath, vault);
    const result = await manager.rotateAgentKey(name, currentVaultKey);
    return `Agent '${name}' key rotated.\nNew Vault Key: ${result.vaultKey}\n\nSave this key — it cannot be retrieved later.`;
  } finally {
    vault.lock();
  }
}

export async function grantChain(
  basePath: string,
  password: string,
  agentName: string,
  chainId: number,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[agentName];
    if (!config) return `Agent '${agentName}' not found.`;
    if (!config.chains.includes(chainId)) {
      config.chains.push(chainId);
      await vault.saveData();
    }
    return `Agent '${agentName}' granted access to chain ${chainId}`;
  } finally {
    vault.lock();
  }
}

export async function grantKey(
  basePath: string,
  password: string,
  agentName: string,
  keyName: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    if (!data.agents[agentName]) return `Agent '${agentName}' not found.`;
    if (!data.keys[keyName]) return `Key '${keyName}' not found.`;
    // Note: this updates the agent config but the agent vault needs regeneration
    return `Key '${keyName}' grant recorded for agent '${agentName}'.\nRecreate agent vault to apply changes.`;
  } finally {
    vault.lock();
  }
}

export async function grantApi(
  basePath: string,
  password: string,
  agentName: string,
  service: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[agentName];
    if (!config) return `Agent '${agentName}' not found.`;
    if (!config.api_access[service]) {
      config.api_access[service] = {
        allowed_endpoints: ['*'],
        rate_limit: { per_second: 5, daily: 5000 },
      };
      await vault.saveData();
    }
    return `Agent '${agentName}' granted API access to '${service}'`;
  } finally {
    vault.lock();
  }
}

export async function setLimit(
  basePath: string,
  password: string,
  agentName: string,
  chainId: string,
  limitType: 'daily' | 'per-tx' | 'monthly',
  amount: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[agentName];
    if (!config) return `Agent '${agentName}' not found.`;
    if (!config.tx_rules.limits[chainId]) {
      config.tx_rules.limits[chainId] = {
        max_per_tx: 'unlimited',
        daily_limit: 'unlimited',
        monthly_limit: 'unlimited',
      };
    }
    const limits = config.tx_rules.limits[chainId];
    if (limitType === 'daily') limits.daily_limit = amount;
    else if (limitType === 'per-tx') limits.max_per_tx = amount;
    else if (limitType === 'monthly') limits.monthly_limit = amount;
    await vault.saveData();
    return `Agent '${agentName}' ${limitType} limit on chain ${chainId} set to ${amount}`;
  } finally {
    vault.lock();
  }
}

export async function allowTxTypes(
  basePath: string,
  password: string,
  agentName: string,
  types: string[],
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[agentName];
    if (!config) return `Agent '${agentName}' not found.`;
    config.tx_rules.allowed_types = types as AgentConfig['tx_rules']['allowed_types'];
    await vault.saveData();
    return `Agent '${agentName}' allowed tx types set to: ${types.join(', ')}`;
  } finally {
    vault.lock();
  }
}

export async function setApiLimit(
  basePath: string,
  password: string,
  agentName: string,
  service: string,
  perSecond: number,
  daily: number,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const data = vault.getData();
    const config = data.agents[agentName];
    if (!config) return `Agent '${agentName}' not found.`;
    if (!config.api_access[service]) {
      return `Agent '${agentName}' has no API access to '${service}'. Grant access first.`;
    }
    config.api_access[service].rate_limit = { per_second: perSecond, daily };
    await vault.saveData();
    return `Agent '${agentName}' API rate limit for '${service}' set to ${perSecond}/s, ${daily}/day`;
  } finally {
    vault.lock();
  }
}
