import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from '../db/database.js';
import { SpendStore } from '../db/spend-store.js';
import { RulesEngine, type TxRequest, type ApiRequest } from './engine.js';
import type { AgentConfig } from '../vault/types.js';

const DEPLOYER_CONFIG: AgentConfig = {
  name: 'deployer',
  chains: [11155111],
  tx_rules: {
    allowed_types: ['deploy', 'write', 'read', 'simulate'],
    limits: {
      '11155111': { max_per_tx: '1.0', daily_limit: '5.0', monthly_limit: '50.0' },
    },
  },
  api_access: {
    etherscan: {
      allowed_endpoints: ['getabi', 'getsourcecode'],
      rate_limit: { per_second: 5, daily: 5000 },
    },
  },
  contract_rules: { mode: 'none' },
};

const READER_CONFIG: AgentConfig = {
  name: 'reader',
  chains: [1, 11155111],
  tx_rules: {
    allowed_types: ['read', 'simulate'],
    limits: {},
  },
  api_access: {},
  contract_rules: {
    mode: 'whitelist',
    addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
  },
};

describe('RulesEngine', () => {
  describe('checkTxRequest', () => {
    it('approves a valid deploy request', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 11155111,
        value: '0.5',
      });
      expect(result.approved).toBe(true);
    });

    it('denies request for unauthorized chain', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 1, // mainnet not in deployer's chains
        value: '0',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('chain');
    });

    it('denies request for unauthorized tx type', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'deploy',
        chain_id: 1,
        value: '0',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('type');
    });

    it('denies request exceeding per-tx limit', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '1.5', // exceeds max_per_tx of 1.0
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('per-tx limit');
    });

    it('approves request within per-tx limit', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '0.9',
      });
      expect(result.approved).toBe(true);
    });

    it('always approves read requests', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
      });
      expect(result.approved).toBe(true);
    });

    it('denies write to non-whitelisted contract', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
        to_address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('whitelist');
    });

    it('approves request to whitelisted contract', () => {
      const engine = new RulesEngine(READER_CONFIG);
      const result = engine.checkTxRequest({
        type: 'read',
        chain_id: 1,
        value: '0',
        to_address: '0x1234567890abcdef1234567890abcdef12345678',
      });
      expect(result.approved).toBe(true);
    });

    it('tracks daily spending and denies when exceeded', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);

      // Spend 4.5 across multiple txs
      engine.recordSpend(11155111, 4.5);

      const result = engine.checkTxRequest({
        type: 'write',
        chain_id: 11155111,
        value: '1.0', // 4.5 + 1.0 = 5.5 > daily_limit of 5.0
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('daily limit');
    });
  });

  describe('checkApiRequest', () => {
    it('approves a valid API request', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'getabi',
      });
      expect(result.approved).toBe(true);
    });

    it('denies request for unauthorized service', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'coingecko',
        endpoint: 'price',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('service');
    });

    it('denies request for non-whitelisted endpoint', () => {
      const engine = new RulesEngine(DEPLOYER_CONFIG);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'sendrawtransaction',
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('endpoint');
    });

    it('approves wildcard endpoints', () => {
      const config: AgentConfig = {
        ...DEPLOYER_CONFIG,
        api_access: {
          etherscan: {
            allowed_endpoints: ['*'],
            rate_limit: { per_second: 5, daily: 5000 },
          },
        },
      };
      const engine = new RulesEngine(config);
      const result = engine.checkApiRequest({
        service: 'etherscan',
        endpoint: 'anything',
      });
      expect(result.approved).toBe(true);
    });
  });
});

describe('RulesEngine with SpendStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let spendStore: SpendStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-rules-db-'));
    db = new ChainVaultDB(testDir);
    spendStore = new SpendStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('uses SpendStore for persistent spend tracking', () => {
    const engine = new RulesEngine(DEPLOYER_CONFIG, { spendStore, agentName: 'deployer' });
    engine.recordSpend(11155111, 4.5);

    const engine2 = new RulesEngine(DEPLOYER_CONFIG, { spendStore, agentName: 'deployer' });
    const result = engine2.checkTxRequest({
      type: 'write',
      chain_id: 11155111,
      value: '1.0',
    });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('daily limit');
  });

  it('falls back to in-memory when no SpendStore provided', () => {
    const engine = new RulesEngine(DEPLOYER_CONFIG);
    engine.recordSpend(11155111, 4.5);
    const result = engine.checkTxRequest({
      type: 'write',
      chain_id: 11155111,
      value: '1.0',
    });
    expect(result.approved).toBe(false);
  });
});
