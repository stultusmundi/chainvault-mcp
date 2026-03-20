import type { ChainVaultDB } from './database.js';

export interface AuditEntry {
  timestamp: string;
  agent: string;
  action: string;
  chain_id: number;
  status: 'approved' | 'denied';
  details: string;
}

type LogInput = Omit<AuditEntry, 'timestamp'>;

interface FilterOptions {
  agent?: string;
  status?: 'approved' | 'denied';
}

export class AuditStore {
  private db: ChainVaultDB;

  constructor(db: ChainVaultDB) {
    this.db = db;
  }

  log(entry: LogInput): void {
    this.db.getDB().prepare(
      'INSERT INTO audit_entries (timestamp, agent, action, chain_id, status, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      new Date().toISOString(),
      entry.agent,
      entry.action,
      entry.chain_id,
      entry.status,
      entry.details,
    );
  }

  getEntries(filter?: FilterOptions, limit?: number): AuditEntry[] {
    let sql = 'SELECT timestamp, agent, action, chain_id, status, details FROM audit_entries WHERE 1=1';
    const params: any[] = [];

    if (filter?.agent) {
      sql += ' AND agent = ?';
      params.push(filter.agent);
    }
    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY id DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    return this.db.getDB().prepare(sql).all(...params) as AuditEntry[];
  }
}
