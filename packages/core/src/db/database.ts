import Database, { type Database as DatabaseType } from 'better-sqlite3';
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
    status TEXT NOT NULL CHECK(status IN ('approved', 'denied')),
    details TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_entries(agent)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_entries(status)`,
];

export class ChainVaultDB {
  private db: DatabaseType;

  constructor(basePath: string) {
    mkdirSync(basePath, { recursive: true });
    this.db = new Database(join(basePath, DB_FILENAME));
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();
  }

  private runMigrations(): void {
    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
  }

  getDB(): DatabaseType {
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
