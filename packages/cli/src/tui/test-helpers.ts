import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault, AgentVaultManager, ChainVaultDB, AuditStore } from '@chainvault/core';

export const KEYS = {
  UP: '\x1B[A',
  DOWN: '\x1B[B',
  ENTER: '\r',
  ESCAPE: '\x1B',
  BACKSPACE: '\x7F',
  TAB: '\t',
} as const;

export function type(stdin: { write: (s: string) => void }, text: string) {
  for (const char of text) {
    stdin.write(char);
  }
}

export function press(stdin: { write: (s: string) => void }, key: keyof typeof KEYS) {
  stdin.write(KEYS[key]);
}

const TEST_PASSWORD = 'test-password-123';
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export { TEST_PASSWORD, TEST_PRIVATE_KEY };

export async function createTestVault(): Promise<{
  dir: string;
  vault: MasterVault;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-tui-test-'));
  await MasterVault.init(dir, TEST_PASSWORD);
  const vault = await MasterVault.unlock(dir, TEST_PASSWORD);
  return {
    dir,
    vault,
    cleanup: async () => {
      vault.lock();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function createTestVaultWithData(): Promise<{
  dir: string;
  vault: MasterVault;
  manager: AgentVaultManager;
  cleanup: () => Promise<void>;
}> {
  const { dir, vault, cleanup } = await createTestVault();
  await vault.addKey('test-wallet', TEST_PRIVATE_KEY, [1, 11155111]);
  await vault.addApiKey('etherscan', 'TEST_KEY', 'https://api.etherscan.io');
  await vault.addRpcEndpoint('sepolia', 'https://rpc.sepolia.org', 11155111);
  const manager = new AgentVaultManager(dir, vault);
  return { dir, vault, manager, cleanup };
}

export function createTestAuditStore(dir: string): AuditStore {
  const db = new ChainVaultDB(dir);
  return new AuditStore(db);
}

export async function waitForRender(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
