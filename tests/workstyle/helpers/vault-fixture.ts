import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault, AgentVaultManager, type AgentConfig } from '@chainvault/core';
import { ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './anvil.js';

export interface FixtureAgentSpec {
  name: string;
  chains?: number[];
  allowedTypes?: Array<'deploy' | 'write' | 'transfer' | 'read' | 'simulate'>;
  limits?: Record<string, { max_per_tx: string; daily_limit: string; monthly_limit: string }>;
  contractRules?: AgentConfig['contract_rules'];
  grantKeys?: string[];
  grantApis?: string[];
}

export interface VaultFixtureOptions {
  rpcUrl: string;
  chainId?: number;
  /** Extra API keys to add to the master vault: name -> { key, baseUrl } */
  apiKeys?: Record<string, { key: string; baseUrl: string }>;
  agents?: FixtureAgentSpec[];
}

export interface VaultFixture {
  basePath: string;
  password: string;
  vaultKeys: Record<string, string>;
  cleanup(): Promise<void>;
}

export const FIXTURE_PASSWORD = 'workstyle-test-password';

export async function createVaultFixture(opts: VaultFixtureOptions): Promise<VaultFixture> {
  const chainId = opts.chainId ?? ANVIL_CHAIN_ID;
  const basePath = await mkdtemp(join(tmpdir(), 'chainvault-workstyle-'));

  await MasterVault.init(basePath, FIXTURE_PASSWORD);
  const vault = await MasterVault.unlock(basePath, FIXTURE_PASSWORD);
  try {
    await vault.addKey('anvil-0', ANVIL_ACCOUNTS[0].privateKey, [chainId]);
    await vault.addRpcEndpoint('workstyle-rpc', opts.rpcUrl, chainId);
    for (const [name, api] of Object.entries(opts.apiKeys ?? {})) {
      await vault.addApiKey(name, api.key, api.baseUrl);
    }

    const manager = new AgentVaultManager(basePath, vault);
    const vaultKeys: Record<string, string> = {};
    const agents = opts.agents ?? [{ name: 'workstyle-agent' }];

    for (const spec of agents) {
      const config: AgentConfig = {
        name: spec.name,
        chains: spec.chains ?? [chainId],
        tx_rules: {
          allowed_types: spec.allowedTypes ?? ['deploy', 'write', 'transfer', 'read', 'simulate'],
          limits: spec.limits ?? {},
        },
        api_access: Object.fromEntries(
          (spec.grantApis ?? []).map((api) => [
            api,
            { allowed_endpoints: ['*'], rate_limit: { per_second: 10, daily: 10_000 } },
          ]),
        ),
        contract_rules: spec.contractRules ?? { mode: 'none' },
      };
      const { vaultKey } = await manager.createAgent(
        config,
        spec.grantKeys ?? ['anvil-0'],
        spec.grantApis ?? [],
      );
      vaultKeys[spec.name] = vaultKey;
    }

    return {
      basePath,
      password: FIXTURE_PASSWORD,
      vaultKeys,
      cleanup: async () => {
        await rm(basePath, { recursive: true, force: true });
      },
    };
  } finally {
    vault.lock();
  }
}
