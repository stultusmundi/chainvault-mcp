import { AuditLogger } from '@chainvault/core';

export async function viewLogs(
  basePath: string,
  options: { agent?: string; denied?: boolean },
): Promise<string> {
  const logger = new AuditLogger(basePath);
  const filter: { agent?: string; status?: 'denied' } = {};
  if (options.agent) filter.agent = options.agent;
  if (options.denied) filter.status = 'denied';

  const entries = await logger.getEntries(filter);
  if (entries.length === 0) return 'No log entries found.';

  return entries
    .map((e) => {
      const status = e.status === 'denied' ? 'DENIED' : 'OK';
      return `[${e.timestamp}] ${status} ${e.agent} ${e.action} chain=${e.chain_id} ${e.details}`;
    })
    .join('\n');
}
