import { createCipheriv, createDecipheriv, randomBytes, hkdf } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256-bit key
const HKDF_HASH = 'sha256';
const HKDF_INFO = Buffer.from('chainvault-master-key');

/**
 * Derives a 256-bit encryption key from a password and salt using HKDF.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    hkdf(
      HKDF_HASH,
      password,
      salt,
      HKDF_INFO,
      KEY_LENGTH,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(derivedKey));
      },
    );
  });
}

/**
 * Encrypts plaintext with AES-256-GCM. Returns base64-encoded string
 * containing IV + authTag + ciphertext.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext.
 */
export function decrypt(encryptedBase64: string, key: Buffer): string {
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Generates a cryptographically random 256-bit key.
 */
export function generateRandomKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Generates an agent vault key string (cv_agent_<hex>) and its raw Buffer.
 */
export function generateVaultKeyString(): {
  keyString: string;
  keyBuffer: Buffer;
} {
  const keyBuffer = generateRandomKey();
  const keyString = `cv_agent_${keyBuffer.toString('hex')}`;
  return { keyString, keyBuffer };
}
