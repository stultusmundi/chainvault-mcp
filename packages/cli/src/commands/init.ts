import { MasterVault } from '@chainvault/core';

export async function initVault(basePath: string, password: string): Promise<string> {
  await MasterVault.init(basePath, password);
  return `ChainVault initialized at ${basePath}`;
}
