import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { decrypt } from '../vault/crypto.js';
import { AgentVaultDataSchema, type AgentVaultData, type AgentConfig } from '../vault/types.js';
import { RulesEngine } from '../rules/engine.js';
import { readFile } from 'node:fs/promises';

const AGENTS_DIR = 'agents';

export interface AgentKeyInfo {
  name: string;
  address: string;
  chains: number[];
}

export interface AgentContext {
  agentName: string;
  config: AgentConfig;
  rules: RulesEngine;
  keys: AgentKeyInfo[];
  vaultData: AgentVaultData;
}

/**
 * Creates an agent context by scanning agent vault files and attempting
 * to decrypt with the provided vault key.
 *
 * Returns null if no vault key is provided.
 * Throws if a vault key is provided but no matching vault is found.
 */
export async function createAgentContext(
  basePath: string,
  vaultKey: string | undefined,
): Promise<AgentContext | null> {
  if (!vaultKey) {
    return null;
  }

  const hexPart = vaultKey.replace('cv_agent_', '');
  const keyBuffer = Buffer.from(hexPart, 'hex');

  const agentsDir = join(basePath, AGENTS_DIR);

  let vaultFiles: string[];
  try {
    const entries = await readdir(agentsDir);
    vaultFiles = entries.filter((f) => f.endsWith('.vault'));
  } catch {
    throw new Error('No agent vaults found — agents directory does not exist');
  }

  if (vaultFiles.length === 0) {
    throw new Error('No agent vaults found');
  }

  for (const filename of vaultFiles) {
    try {
      const encrypted = await readFile(join(agentsDir, filename), 'utf8');
      const decrypted = decrypt(encrypted, keyBuffer);
      const vaultData = AgentVaultDataSchema.parse(JSON.parse(decrypted));

      // Extract public key info only — NEVER expose private keys
      const keys: AgentKeyInfo[] = Object.entries(vaultData.keys).map(
        ([name, key]) => ({
          name,
          address: key.address,
          chains: key.chains,
        }),
      );

      const rules = new RulesEngine(vaultData.config);

      return {
        agentName: vaultData.agent_name,
        config: vaultData.config,
        rules,
        keys,
        vaultData,
      };
    } catch {
      // Wrong key for this vault file, try the next one
      continue;
    }
  }

  throw new Error('Invalid vault key — no matching agent vault found');
}
