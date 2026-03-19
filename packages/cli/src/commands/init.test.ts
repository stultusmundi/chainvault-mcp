import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault } from './init.js';

describe('initVault', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'chainvault-cli-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates vault files in the target directory', async () => {
    await initVault(testDir, 'test-password');
    expect(existsSync(join(testDir, 'master.vault'))).toBe(true);
    expect(existsSync(join(testDir, 'master.salt'))).toBe(true);
  });

  it('returns success message', async () => {
    const result = await initVault(testDir, 'test-password');
    expect(result).toContain('initialized');
  });
});
