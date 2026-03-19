import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogger, type AuditEntry } from './logger.js';

describe('AuditLogger', () => {
  let testDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-audit-'));
    logger = new AuditLogger(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('logs an approved action', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'Deployed contract to Sepolia',
    });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('deployer');
    expect(entries[0].status).toBe('approved');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('logs a denied action', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 1,
      status: 'denied',
      details: 'Chain 1 not in allowed chains',
    });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('denied');
  });

  it('accumulates multiple entries', async () => {
    await logger.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'b', action: 'write', chain_id: 1, status: 'denied', details: '' });
    await logger.log({ agent: 'a', action: 'read', chain_id: 1, status: 'approved', details: '' });

    const entries = await logger.getEntries();
    expect(entries).toHaveLength(3);
  });

  it('filters by agent name', async () => {
    await logger.log({ agent: 'deployer', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'reader', action: 'read', chain_id: 1, status: 'approved', details: '' });

    const filtered = await logger.getEntries({ agent: 'deployer' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].agent).toBe('deployer');
  });

  it('filters by status', async () => {
    await logger.log({ agent: 'a', action: 'deploy', chain_id: 1, status: 'approved', details: '' });
    await logger.log({ agent: 'a', action: 'write', chain_id: 1, status: 'denied', details: '' });

    const denied = await logger.getEntries({ status: 'denied' });
    expect(denied).toHaveLength(1);
    expect(denied[0].status).toBe('denied');
  });

  it('never contains secrets in log output', async () => {
    await logger.log({
      agent: 'deployer',
      action: 'deploy_contract',
      chain_id: 11155111,
      status: 'approved',
      details: 'tx: 0xabc123',
    });

    const raw = await readFile(join(testDir, 'audit.log'), 'utf8');
    expect(raw).not.toContain('private_key');
    expect(raw).not.toContain('0xac0974bec39a17');
  });
});
