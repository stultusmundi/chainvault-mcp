import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DB_FILENAME = 'chainvault.db';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS spend_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    timestamp INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_spend_agent_chain
    ON spend_records(agent_name, chain_id, timestamp)`,
  `CREATE TABLE IF NOT EXISTS audit_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent TEXT NOT NULL,
    action TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('approved', 'denied', 'error')),
    details TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_entries(agent)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_entries(status)`,
];

export class ChainVaultDB {
  private db: DatabaseSync;

  constructor(basePath: string) {
    mkdirSync(basePath, { recursive: true });
    this.db = new DatabaseSync(join(basePath, DB_FILENAME));
    this.db.exec('PRAGMA journal_mode = WAL');
    this.rebuildAuditTableIfNeeded();
    this.runMigrations();
  }

  private rebuildAuditTableIfNeeded(): void {
    const row = this.db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_entries'`)
      .get() as unknown as { sql: string } | undefined;
    if (!row || row.sql.includes(`'error'`)) return;
    this.db.exec(`
      BEGIN;
      ALTER TABLE audit_entries RENAME TO audit_entries_old;
      CREATE TABLE audit_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent TEXT NOT NULL,
        action TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('approved', 'denied', 'error')),
        details TEXT NOT NULL
      );
      INSERT INTO audit_entries SELECT * FROM audit_entries_old;
      DROP TABLE audit_entries_old;
      COMMIT;
    `);
  }

  private runMigrations(): void {
    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
  }

  getDB(): DatabaseSync {
    return this.db;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}
