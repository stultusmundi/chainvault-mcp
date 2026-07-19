import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';

const solcReady = await compilerAvailable();

describe.skipIf(!solcReady)('corpus pipeline', () => {
  it('compiles TestToken to ABI + bytecode', async () => {
    const result = await compileCorpusContract('TestToken');
    const fnNames = result.abi.filter((e: any) => e.type === 'function').map((e: any) => e.name);
    expect(fnNames).toEqual(expect.arrayContaining(['transfer', 'approve', 'transferFrom', 'balanceOf']));
    expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it('caches compiled artifacts on disk', async () => {
    await compileCorpusContract('TestToken');
    const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '.artifacts');
    expect(existsSync(artifactsDir)).toBe(true);
    expect(readdirSync(artifactsDir).some((f) => f.startsWith('TestToken.'))).toBe(true);
    // Second call served from cache (returns identical data without error)
    const again = await compileCorpusContract('TestToken');
    expect(again.bytecode.length).toBeGreaterThan(2);
  });

  const CORPUS: Array<[file: string, contract: string]> = [
    ['TestToken', 'TestToken'],
    ['TestNFT', 'TestNFT'],
    ['PayableVault', 'PayableVault'],
    ['Reverter', 'Reverter'],
    ['EventStorm', 'EventStorm'],
    ['Factory', 'Factory'],
    ['Factory', 'Child'],
    ['Counter', 'CounterProxy'],
    ['Counter', 'CounterV1'],
    ['Counter', 'CounterV2'],
    ['GasHog', 'GasHog'],
    ['FeeToken', 'FeeToken'],
  ];

  it.each(CORPUS)('compiles %s:%s', async (file, contract) => {
    const result = await compileCorpusContract(file, contract);
    expect(result.abi.length).toBeGreaterThan(0);
    expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
  });
});
