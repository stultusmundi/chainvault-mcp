import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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

const LOG_FILENAME = 'audit.log';

export class AuditLogger {
  private logPath: string;

  constructor(basePath: string) {
    this.logPath = join(basePath, LOG_FILENAME);
  }

  async log(entry: LogInput): Promise<void> {
    const full: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    const line = JSON.stringify(full) + '\n';
    await mkdir(join(this.logPath, '..'), { recursive: true });
    await appendFile(this.logPath, line, 'utf8');
  }

  async getEntries(filter?: FilterOptions): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch {
      return [];
    }

    const entries: AuditEntry[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    if (!filter) return entries;

    return entries.filter((e) => {
      if (filter.agent && e.agent !== filter.agent) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }
}
