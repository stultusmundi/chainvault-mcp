import { MasterVault } from '@chainvault/core';

export async function addKey(
  basePath: string,
  password: string,
  name: string,
  privateKey: string,
  chains: number[],
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.addKey(name, privateKey, chains);
    return `Key '${name}' added successfully`;
  } finally {
    vault.lock();
  }
}

export async function listKeys(basePath: string, password: string): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    const keys = vault.listKeys();
    if (keys.length === 0) return 'No keys stored.';
    return keys
      .map((k) => `${k.name}: ${k.address} (chains: ${k.chains.join(', ')})`)
      .join('\n');
  } finally {
    vault.lock();
  }
}

export async function removeKey(
  basePath: string,
  password: string,
  name: string,
): Promise<string> {
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.removeKey(name);
    return `Key '${name}' removed`;
  } finally {
    vault.lock();
  }
}
