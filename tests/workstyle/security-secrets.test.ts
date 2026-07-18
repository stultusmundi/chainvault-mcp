import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as cryptoModule from '../../packages/core/src/vault/crypto.js';
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolText, type WorkstyleMcp } from './helpers/mcp.js';
import { assertNoSecrets } from './helpers/secrets.js';
import { FIXTURE_PASSWORD } from './helpers/vault-fixture.js';

vi.mock('../../packages/core/src/vault/crypto.js', async (importOriginal) => {
  const original = await importOriginal<typeof cryptoModule>();
  return { ...original, decrypt: vi.fn(original.decrypt) };
});

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('secret non-exposure and zero-decryption', () => {
  let mcp: WorkstyleMcp;
  let secrets: string[];
  let reverterAddress: string;
  let reverterAbi: string;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp();
    secrets = [
      ANVIL_ACCOUNTS[0].privateKey,
      mcp.fixture.vaultKeys['workstyle-agent'],
      FIXTURE_PASSWORD,
    ];
    const { abi, bytecode } = await compileCorpusContract('Reverter');
    reverterAbi = JSON.stringify(abi);
    const deployText = await callToolText(mcp.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: reverterAbi, bytecode, constructor_args: [],
    });
    reverterAddress = JSON.parse(deployText).contractAddress;
  });

  afterAll(async () => {
    await mcp.close();
  });

  async function auditRows(): Promise<unknown[]> {
    const db = new ChainVaultDB(mcp.fixture.basePath);
    try {
      return db.getDB().prepare('SELECT * FROM audit_entries').all() as unknown[];
    } finally {
      db.close();
    }
  }

  it('denied requests trigger zero vault decryptions', async () => {
    const decryptSpy = cryptoModule.decrypt as unknown as ReturnType<typeof vi.fn>;
    const before = decryptSpy.mock.calls.length;
    // Sanity-check the spy is actually wired to the module the server uses —
    // agent context init necessarily decrypts once to find the agent vault.
    // A spy that never attaches (module-resolution mismatch) would make the
    // assertion below vacuously true, so we assert it's live first.
    expect(before).toBeGreaterThan(0);
    const text = await callToolText(mcp.client, 'deploy_contract', {
      chain_id: 1, abi: reverterAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('chain 1');
    expect(decryptSpy.mock.calls.length).toBe(before);
  });

  it('revert errors carry no secret material', async () => {
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverterAddress, abi: reverterAbi,
      function_name: 'failCustomError', args: [],
    });
    assertNoSecrets(text, secrets);
  });

  it('malformed input errors carry no secret material', async () => {
    let outcome: unknown;
    try {
      outcome = await mcp.client.callTool({
        name: 'interact_contract',
        arguments: { chain_id: 'not-a-number' as unknown as number },
      });
    } catch (err) {
      outcome = err;
    }
    assertNoSecrets(outcome, secrets);
  });

  it('audit log contains no secret material after all of the above', async () => {
    assertNoSecrets(await auditRows(), secrets);
  });

  it('a dead RPC surfaces a sanitized error with no secret material', async () => {
    // Kill the chain out from under the server, then attempt a write
    await mcp.anvil.stop();
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverterAddress, abi: reverterAbi,
      function_name: 'succeed', args: [],
    });
    assertNoSecrets(text, secrets);
    assertNoSecrets(await auditRows(), secrets);
  });
});
