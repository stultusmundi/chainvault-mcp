import { describe, it, expect } from 'vitest';
import {
  MasterVaultDataSchema,
  AgentVaultDataSchema,
  AgentConfigSchema,
  TxRulesSchema,
  ApiAccessRuleSchema,
} from './types.js';

describe('TxRulesSchema', () => {
  it('validates valid tx rules', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['deploy', 'write', 'read', 'simulate'],
      limits: {
        '11155111': { max_per_tx: 'unlimited', daily_limit: 'unlimited', monthly_limit: 'unlimited' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tx type', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['hack'],
      limits: {},
    });
    expect(result.success).toBe(false);
  });

  it('validates numeric limits', () => {
    const result = TxRulesSchema.safeParse({
      allowed_types: ['read'],
      limits: {
        '1': { max_per_tx: '0.5', daily_limit: '1.0', monthly_limit: '10.0' },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ApiAccessRuleSchema', () => {
  it('validates valid API access rule', () => {
    const result = ApiAccessRuleSchema.safeParse({
      allowed_endpoints: ['getabi', 'getsourcecode'],
      rate_limit: { per_second: 5, daily: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('validates wildcard endpoints', () => {
    const result = ApiAccessRuleSchema.safeParse({
      allowed_endpoints: ['*'],
      rate_limit: { per_second: 10, daily: 10000 },
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentConfigSchema', () => {
  it('validates a full agent config', () => {
    const result = AgentConfigSchema.safeParse({
      name: 'deployer',
      chains: [11155111],
      tx_rules: {
        allowed_types: ['deploy', 'write', 'read', 'simulate'],
        limits: {
          '11155111': { max_per_tx: 'unlimited', daily_limit: 'unlimited', monthly_limit: 'unlimited' },
        },
      },
      api_access: {
        etherscan: {
          allowed_endpoints: ['*'],
          rate_limit: { per_second: 5, daily: 5000 },
        },
      },
      contract_rules: { mode: 'none' },
    });
    expect(result.success).toBe(true);
  });

  it('validates contract whitelist mode', () => {
    const result = AgentConfigSchema.safeParse({
      name: 'reader',
      chains: [1],
      tx_rules: { allowed_types: ['read'], limits: {} },
      api_access: {},
      contract_rules: {
        mode: 'whitelist',
        addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('MasterVaultDataSchema', () => {
  it('validates a minimal master vault', () => {
    const result = MasterVaultDataSchema.safeParse({
      version: 1,
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
      agents: {},
    });
    expect(result.success).toBe(true);
  });

  it('validates master vault with keys and agents', () => {
    const result = MasterVaultDataSchema.safeParse({
      version: 1,
      keys: {
        'my-wallet': {
          private_key: '0xabc123',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chains: [1, 11155111],
        },
      },
      api_keys: {
        etherscan: { key: 'ABCDEF123', base_url: 'https://api.etherscan.io' },
      },
      rpc_endpoints: {
        mainnet: { url: 'https://mainnet.infura.io/v3/KEY', chain_id: 1 },
      },
      agents: {
        deployer: {
          name: 'deployer',
          chains: [11155111],
          tx_rules: { allowed_types: ['deploy', 'read'], limits: {} },
          api_access: {},
          contract_rules: { mode: 'none' },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentVaultDataSchema', () => {
  it('validates an agent vault', () => {
    const result = AgentVaultDataSchema.safeParse({
      version: 1,
      agent_name: 'deployer',
      config: {
        name: 'deployer',
        chains: [11155111],
        tx_rules: { allowed_types: ['deploy', 'read'], limits: {} },
        api_access: {},
        contract_rules: { mode: 'none' },
      },
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
    });
    expect(result.success).toBe(true);
  });
});
