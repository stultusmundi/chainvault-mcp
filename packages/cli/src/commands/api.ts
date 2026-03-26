import { MasterVault } from '@chainvault/core';

export async function addApiKey(
  basePath: string,
  password: string,
  name: string,
  key: string,
  baseUrl: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.addApiKey(name, key, baseUrl);
    return `API key '${name}' added (${baseUrl})`;
  } finally {
    vault.lock();
  }
}

export async function listApiKeys(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const apiKeys = vault.listApiKeys();
    if (apiKeys.length === 0) return 'No API keys stored.';
    return apiKeys
      .map((k) => `${k.name}: ${k.base_url}`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function removeApiKey(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.removeApiKey(name);
    return `API key '${name}' removed`;
  } finally {
    vault.lock();
  }
}

export async function addRpcEndpoint(
  basePath: string,
  password: string,
  name: string,
  url: string,
  chainId: number,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.addRpcEndpoint(name, url, chainId);
    return `RPC endpoint '${name}' added (chain ${chainId})`;
  } finally {
    vault.lock();
  }
}

export async function listRpcEndpoints(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const endpoints = vault.listRpcEndpoints();
    if (endpoints.length === 0) return 'No RPC endpoints stored.';
    return endpoints
      .map((e) => `${e.name}: ${e.url} (chain ${e.chain_id})`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function removeRpcEndpoint(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.removeRpcEndpoint(name);
    return `RPC endpoint '${name}' removed`;
  } finally {
    vault.lock();
  }
}
