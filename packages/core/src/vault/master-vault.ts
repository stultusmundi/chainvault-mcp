import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { privateKeyToAddress } from 'viem/accounts';
import { deriveKeyFromPassword, encrypt, decrypt, generateRandomKey } from './crypto.js';
import { MasterVaultDataSchema, type MasterVaultData } from './types.js';

const VAULT_FILENAME = 'master.vault';
const SALT_FILENAME = 'master.salt';

export class MasterVault {
  private data: MasterVaultData | null = null;
  private masterKey: Buffer | null = null;
  private basePath: string;
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(basePath: string) {
    this.basePath = basePath;
  }

  static async init(basePath: string, password: string): Promise<void> {
    await mkdir(basePath, { recursive: true });

    const vaultPath = join(basePath, VAULT_FILENAME);
    try {
      await access(vaultPath);
      throw new Error('Vault already exists at this location');
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const salt = generateRandomKey(); // 32 random bytes as salt
    const masterKey = await deriveKeyFromPassword(password, salt);

    const emptyVault: MasterVaultData = {
      version: 1,
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
      agents: {},
    };

    const encrypted = encrypt(JSON.stringify(emptyVault), masterKey);
    await writeFile(join(basePath, SALT_FILENAME), salt);
    await writeFile(vaultPath, encrypted, 'utf8');
  }

  static async unlock(
    basePath: string,
    password: string,
    options?: { autoLockMs?: number },
  ): Promise<MasterVault> {
    const salt = await readFile(join(basePath, SALT_FILENAME));
    const masterKey = await deriveKeyFromPassword(password, salt);

    const encrypted = await readFile(join(basePath, VAULT_FILENAME), 'utf8');
    const decrypted = decrypt(encrypted, masterKey);
    const data = MasterVaultDataSchema.parse(JSON.parse(decrypted));

    const vault = new MasterVault(basePath);
    vault.data = data;
    vault.masterKey = masterKey;

    const autoLockMs = options?.autoLockMs ?? 15 * 60 * 1000;
    if (autoLockMs > 0) {
      vault.autoLockTimer = setTimeout(() => vault.lock(), autoLockMs);
      vault.autoLockTimer.unref();
    }

    return vault;
  }

  isUnlocked(): boolean {
    return this.data !== null && this.masterKey !== null;
  }

  lock(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    this.data = null;
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  private requireUnlocked(): MasterVaultData {
    if (!this.data || !this.masterKey) {
      throw new Error('Vault is locked');
    }
    return this.data;
  }

  private async save(): Promise<void> {
    const data = this.requireUnlocked();
    const encrypted = encrypt(JSON.stringify(data), this.masterKey!);
    await writeFile(join(this.basePath, VAULT_FILENAME), encrypted, 'utf8');
  }

  // --- Key Management ---

  async addKey(name: string, privateKey: string, chains: number[]): Promise<void> {
    const data = this.requireUnlocked();
    const address = privateKeyToAddress(privateKey as `0x${string}`);
    data.keys[name] = { private_key: privateKey, address, chains };
    await this.save();
  }

  async removeKey(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.keys[name];
    await this.save();
  }

  listKeys(): Array<{ name: string; address: string; chains: number[] }> {
    const data = this.requireUnlocked();
    return Object.entries(data.keys).map(([name, key]) => ({
      name,
      address: key.address,
      chains: key.chains,
    }));
  }

  // --- API Key Management ---

  async addApiKey(name: string, key: string, baseUrl: string): Promise<void> {
    const data = this.requireUnlocked();
    data.api_keys[name] = { key, base_url: baseUrl };
    await this.save();
  }

  async removeApiKey(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.api_keys[name];
    await this.save();
  }

  listApiKeys(): Array<{ name: string; base_url: string }> {
    const data = this.requireUnlocked();
    return Object.entries(data.api_keys).map(([name, apiKey]) => ({
      name,
      base_url: apiKey.base_url,
    }));
  }

  // --- RPC Endpoint Management ---

  async addRpcEndpoint(name: string, url: string, chainId: number): Promise<void> {
    const data = this.requireUnlocked();
    data.rpc_endpoints[name] = { url, chain_id: chainId };
    await this.save();
  }

  async removeRpcEndpoint(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data.rpc_endpoints[name];
    await this.save();
  }

  listRpcEndpoints(): Array<{ name: string; url: string; chain_id: number }> {
    const data = this.requireUnlocked();
    return Object.entries(data.rpc_endpoints).map(([name, ep]) => ({
      name,
      url: ep.url,
      chain_id: ep.chain_id,
    }));
  }

  // --- Agent Config Management (used by AgentVaultManager) ---

  getData(): MasterVaultData {
    return this.requireUnlocked();
  }

  async saveData(): Promise<void> {
    await this.save();
  }
}
