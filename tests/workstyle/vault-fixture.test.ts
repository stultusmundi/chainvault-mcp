import { describe, it, expect } from 'vitest';
import { createAgentContext } from '../../packages/core/src/mcp/context.js';
import { createVaultFixture } from './helpers/vault-fixture.js';
import { ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';

describe('VaultFixture', () => {
  it('creates a working agent vault with key and RPC endpoint', async () => {
    const fixture = await createVaultFixture({ rpcUrl: 'http://127.0.0.1:65001' });
    try {
      const ctx = await createAgentContext(fixture.basePath, fixture.vaultKeys['workstyle-agent']);
      expect(ctx!.agentName).toBe('workstyle-agent');
      expect(ctx!.keys[0].address.toLowerCase()).toBe(ANVIL_ACCOUNTS[0].address.toLowerCase());
      expect(ctx!.getRpcUrlForChain(ANVIL_CHAIN_ID)).toBe('http://127.0.0.1:65001');
      expect(ctx!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBe(ANVIL_ACCOUNTS[0].privateKey);
    } finally {
      await fixture.cleanup();
    }
  });

  it('supports multiple agents with distinct grants', async () => {
    const fixture = await createVaultFixture({
      rpcUrl: 'http://127.0.0.1:65001',
      agents: [
        { name: 'writer' },
        { name: 'reader', allowedTypes: ['read', 'simulate'], grantKeys: [] },
      ],
    });
    try {
      const reader = await createAgentContext(fixture.basePath, fixture.vaultKeys['reader']);
      expect(reader!.keys).toHaveLength(0);
      expect(reader!.getPrivateKeyForChain(ANVIL_CHAIN_ID)).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
