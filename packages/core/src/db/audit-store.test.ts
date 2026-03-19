import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';
import { AuditStore, type AuditEntry } from './audit-store.js';

describe('AuditStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let store: AuditStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-audit-store-'));
    db = new ChainVaultDB(testDir);
    store = new AuditStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('logs an entry and retrieves it', () => {
    store.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'Deployed to Sepolia',
    });
    const entries = store.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('deployer');
    expect(entries[0].status).toBe('approved');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('accumulates entries', () => {
    store.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'b', action: 'write', chain_id: 1, status: 'denied', details: '' });
    expect(store.getEntries()).toHaveLength(2);
  });

  it('filters by agent', () => {
    store.log({ agent: 'deployer', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'reader', action: 'read', chain_id: 1, status: 'approved', details: '' });
    const filtered = store.getEntries({ agent: 'deployer' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].agent).toBe('deployer');
  });

  it('filters by status', () => {
    store.log({ agent: 'a', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    store.log({ agent: 'a', action: 'write', chain_id: 1, status: 'denied', details: '' });
    const denied = store.getEntries({ status: 'denied' });
    expect(denied).toHaveLength(1);
  });

  it('returns entries with limit', () => {
    for (let i = 0; i < 20; i++) {
      store.log({ agent: 'a', action: `action-${i}`, chain_id: 1, status: 'approved', details: '' });
    }
    const limited = store.getEntries({}, 10);
    expect(limited).toHaveLength(10);
  });

  it('persists across instances', () => {
    store.log({ agent: 'a', action: 'test', chain_id: 1, status: 'approved', details: 'persist' });
    const store2 = new AuditStore(db);
    expect(store2.getEntries()).toHaveLength(1);
  });
});
