import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { decrypt } from '../vault/crypto.js';
import { AgentVaultDataSchema, type AgentConfig } from '../vault/types.js';
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
  keys: AgentKeyInfo[];  // public addresses only
  getPrivateKeyForChain(chainId: number): string | null;
  getApiKey(serviceName: string): { key: string; baseUrl: string } | null;
  getApiKeyForExplorer(explorerApiUrl: string): { serviceName: string; key: string } | null;
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

      // Controlled accessors — vaultData stays in closure, never exposed
      const getPrivateKeyForChain = (chainId: number): string | null => {
        for (const [, key] of Object.entries(vaultData.keys)) {
          if (key.chains.includes(chainId)) return key.private_key;
        }
        return null;
      };

      const getApiKey = (serviceName: string): { key: string; baseUrl: string } | null => {
        const entry = vaultData.api_keys[serviceName];
        return entry ? { key: entry.key, baseUrl: entry.base_url } : null;
      };

      const getApiKeyForExplorer = (explorerApiUrl: string): { serviceName: string; key: string } | null => {
        for (const [name, ak] of Object.entries(vaultData.api_keys)) {
          try {
            const akHost = new URL(ak.base_url).hostname;
            const explorerHost = new URL(explorerApiUrl).hostname;
            const akDomain = akHost.split('.').slice(-2).join('.');
            const explorerDomain = explorerHost.split('.').slice(-2).join('.');
            if (akDomain === explorerDomain || akHost.includes(explorerDomain) || explorerHost.includes(akDomain)) {
              return { serviceName: name, key: ak.key };
            }
          } catch { continue; }
        }
        return null;
      };

      return {
        agentName: vaultData.agent_name,
        config: vaultData.config,
        rules,
        keys,
        getPrivateKeyForChain,
        getApiKey,
        getApiKeyForExplorer,
      };
    } catch {
      // Wrong key for this vault file, try the next one
      continue;
    }
  }

  throw new Error('Invalid vault key — no matching agent vault found');
}
