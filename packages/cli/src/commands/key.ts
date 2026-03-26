import { MasterVault } from '@chainvault/core';
import { generatePrivateKey } from 'viem/accounts';
import { mnemonicToAccount } from 'viem/accounts';

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

export async function generateKey(
  basePath: string,
  password: string,
  name: string,
  chains: number[],
): Promise<string> {
  const privateKey = generatePrivateKey();
  const vault = await MasterVault.unlock(basePath, password);
  try {
    await vault.addKey(name, privateKey, chains);
    const keys = vault.listKeys();
    const key = keys.find((k) => k.name === name);
    return `Key '${name}' generated\nAddress: ${key?.address}`;
  } finally {
    vault.lock();
  }
}

export async function addKeyFromSeed(
  basePath: string,
  password: string,
  name: string,
  mnemonic: string,
  chains: number[],
): Promise<string> {
  const account = mnemonicToAccount(mnemonic);
  const vault = await MasterVault.unlock(basePath, password);
  try {
    // mnemonicToAccount doesn't expose the raw private key directly,
    // so we generate the address and use the account's private key
    // viem's HDKey derives the key at m/44'/60'/0'/0/0
    const hdKey = account.getHdKey();
    if (!hdKey.privateKey) throw new Error('Failed to derive private key from seed');
    const privateKeyHex = `0x${Buffer.from(hdKey.privateKey).toString('hex')}`;
    await vault.addKey(name, privateKeyHex, chains);
    return `Key '${name}' imported from seed phrase\nAddress: ${account.address}`;
  } finally {
    vault.lock();
  }
}
