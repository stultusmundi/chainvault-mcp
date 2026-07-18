import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, resolveCompiler, type CompileResult } from '@chainvault/core';

export const SOLC_VERSION = '0.8.24';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(HERE, '..', 'contracts');
const ARTIFACTS_DIR = join(HERE, '..', '.artifacts');

/**
 * Compile a corpus contract by name through ChainVault's own compiler module,
 * with an on-disk cache keyed by solc version + source hash.
 * `contractName` defaults to the file name; pass it explicitly for multi-contract files.
 */
export async function compileCorpusContract(
  fileName: string,
  contractName: string = fileName,
): Promise<CompileResult> {
  const source = await readFile(join(CONTRACTS_DIR, `${fileName}.sol`), 'utf8');
  const hash = createHash('sha256').update(SOLC_VERSION + contractName + source).digest('hex').slice(0, 16);
  const cachePath = join(ARTIFACTS_DIR, `${contractName}.${hash}.json`);

  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as CompileResult;
  } catch {
    // cache miss
  }

  const result = await compile(source, SOLC_VERSION, contractName, true);
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result), 'utf8');
  return result;
}

export async function compilerAvailable(): Promise<boolean> {
  try {
    await resolveCompiler(SOLC_VERSION);
    return true;
  } catch {
    return false;
  }
}
