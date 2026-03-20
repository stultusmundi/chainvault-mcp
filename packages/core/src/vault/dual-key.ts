import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deriveKeyFromPassword, encrypt, decrypt, generateRandomKey } from './crypto.js';

const MASTER_KEY_FILE = 'master.key.enc';
const PASSKEY_FILE = 'passkey.json';
const SALT_FILENAME = 'master.salt';

export class DualKeyManager {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async initWithPassword(password: string): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    const masterKey = generateRandomKey();
    const salt = generateRandomKey();
    const passwordKey = await deriveKeyFromPassword(password, salt);
    const encryptedMasterKey = encrypt(masterKey.toString('hex'), passwordKey);
    await writeFile(join(this.basePath, SALT_FILENAME), salt);
    await writeFile(join(this.basePath, MASTER_KEY_FILE), encryptedMasterKey, 'utf8');
  }

  async unlockWithPassword(password: string): Promise<Buffer> {
    const salt = await readFile(join(this.basePath, SALT_FILENAME));
    const passwordKey = await deriveKeyFromPassword(password, salt);
    const encryptedMasterKey = await readFile(join(this.basePath, MASTER_KEY_FILE), 'utf8');
    try {
      const masterKeyHex = decrypt(encryptedMasterKey, passwordKey);
      return Buffer.from(masterKeyHex, 'hex');
    } catch {
      throw new Error('Wrong password');
    }
  }

  async addPasskey(credentialId: Buffer, masterKey: Buffer): Promise<void> {
    const salt = await readFile(join(this.basePath, SALT_FILENAME));
    const passkeyKey = await deriveKeyFromPassword(credentialId.toString('hex'), salt);
    const encryptedMasterKey = encrypt(masterKey.toString('hex'), passkeyKey);
    const passkeyData = {
      credentialId: credentialId.toString('base64'),
      encryptedMasterKey,
    };
    await writeFile(join(this.basePath, PASSKEY_FILE), JSON.stringify(passkeyData), 'utf8');
  }

  async unlockWithPasskey(credentialId: Buffer): Promise<Buffer> {
    const raw = await readFile(join(this.basePath, PASSKEY_FILE), 'utf8');
    const passkeyData = JSON.parse(raw);
    const salt = await readFile(join(this.basePath, SALT_FILENAME));
    const passkeyKey = await deriveKeyFromPassword(credentialId.toString('hex'), salt);
    try {
      const masterKeyHex = decrypt(passkeyData.encryptedMasterKey, passkeyKey);
      return Buffer.from(masterKeyHex, 'hex');
    } catch {
      throw new Error('Invalid passkey');
    }
  }

  hasPasskey(): boolean {
    return existsSync(join(this.basePath, PASSKEY_FILE));
  }
}
