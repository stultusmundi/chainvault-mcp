import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';
import { SpendStore } from './spend-store.js';

describe('SpendStore', () => {
  let testDir: string;
  let db: ChainVaultDB;
  let store: SpendStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-spend-'));
    db = new ChainVaultDB(testDir);
    store = new SpendStore(db);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('records a spend', () => {
    store.record('deployer', 11155111, 0.5);
    const total = store.getSpentSince('deployer', 11155111, 0);
    expect(total).toBe(0.5);
  });

  it('accumulates multiple spends', () => {
    store.record('deployer', 11155111, 0.5);
    store.record('deployer', 11155111, 0.3);
    const total = store.getSpentSince('deployer', 11155111, 0);
    expect(total).toBeCloseTo(0.8);
  });

  it('filters by agent name', () => {
    store.record('deployer', 11155111, 1.0);
    store.record('reader', 11155111, 2.0);
    expect(store.getSpentSince('deployer', 11155111, 0)).toBe(1.0);
    expect(store.getSpentSince('reader', 11155111, 0)).toBe(2.0);
  });

  it('filters by chain id', () => {
    store.record('deployer', 1, 1.0);
    store.record('deployer', 11155111, 2.0);
    expect(store.getSpentSince('deployer', 1, 0)).toBe(1.0);
    expect(store.getSpentSince('deployer', 11155111, 0)).toBe(2.0);
  });

  it('filters by timestamp', () => {
    const now = Date.now();
    store.record('deployer', 1, 1.0);
    expect(store.getSpentSince('deployer', 1, now + 100000)).toBe(0);
  });

  it('returns 0 for no records', () => {
    expect(store.getSpentSince('nobody', 1, 0)).toBe(0);
  });

  it('persists across SpendStore instances', () => {
    store.record('deployer', 1, 1.5);
    const store2 = new SpendStore(db);
    expect(store2.getSpentSince('deployer', 1, 0)).toBe(1.5);
  });
});
