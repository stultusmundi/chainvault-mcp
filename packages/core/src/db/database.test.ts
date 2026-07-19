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

  it('rebuilds a pre-error-status audit table in place', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { join } = await import('node:path');
    const { unlinkSync } = await import('node:fs');
    // Close the existing DB and delete it to start fresh
    db.close();
    unlinkSync(join(testDir, 'chainvault.db'));

    // Hand-create the OLD schema, with a row, then reopen via ChainVaultDB
    const raw = new DatabaseSync(join(testDir, 'chainvault.db'));
    raw.exec(`CREATE TABLE audit_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, agent TEXT NOT NULL,
      action TEXT NOT NULL, chain_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('approved', 'denied')), details TEXT NOT NULL)`);
    raw.exec(`INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details)
      VALUES ('t', 'a', 'x', 1, 'approved', 'd')`);
    raw.close();

    const upgraded = new ChainVaultDB(testDir);
    upgraded.getDB().prepare(
      `INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details)
       VALUES ('t2', 'a', 'x', 1, 'error', 'boom')`,
    ).run();
    const count = upgraded.getDB().prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as unknown as { c: number };
    expect(count.c).toBe(2);
    upgraded.close();
  });
});
