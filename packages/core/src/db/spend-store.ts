import type { ChainVaultDB } from './database.js';

export class SpendStore {
  private db: ChainVaultDB;

  constructor(db: ChainVaultDB) {
    this.db = db;
  }

  record(agentName: string, chainId: number, amount: number): void {
    this.db.getDB().prepare(
      'INSERT INTO spend_records (agent_name, chain_id, amount, timestamp) VALUES (?, ?, ?, ?)'
    ).run(agentName, chainId, amount, Date.now());
  }

  getSpentSince(agentName: string, chainId: number, since: number): number {
    const result = this.db.getDB().prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM spend_records WHERE agent_name = ? AND chain_id = ? AND timestamp > ?'
    ).get(agentName, chainId, since) as { total: number };
    return result.total;
  }
}
