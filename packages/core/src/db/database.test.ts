import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB } from './database.js';

describe('ChainVaultDB', () => {
  let testDir: string;
  let db: ChainVaultDB;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-db-'));
    db = new ChainVaultDB(testDir);
  });

  afterEach(async () => {
    db.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates database file', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(testDir, 'chainvault.db'))).toBe(true);
  });

  it('creates spend_records table', () => {
    const tables = db.getDB().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='spend_records'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates audit_entries table', () => {
    const tables = db.getDB().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_entries'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('close is idempotent', () => {
    db.close();
    db.close();
  });
});
