import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as cryptoModule from '../../packages/core/src/vault/crypto.js';
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { ChainVaultServer } from '../../packages/core/src/mcp/server.js';
import { anvilAvailable, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID } from './helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { startWorkstyleMcp, callToolText, type WorkstyleMcp } from './helpers/mcp.js';
import { assertNoSecrets } from './helpers/secrets.js';
import { createVaultFixture, FIXTURE_PASSWORD } from './helpers/vault-fixture.js';

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
    const rows = await auditRows();
    expect(rows.length).toBeGreaterThan(0);
    assertNoSecrets(rows, secrets);
  });

  it('a dead RPC surfaces a sanitized error with no secret material', async () => {
    // Kill the chain out from under the server, then attempt a write
    await mcp.anvil.stop();
    const text = await callToolText(mcp.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: reverterAddress, abi: reverterAbi,
      function_name: 'succeed', args: [],
    });
    assertNoSecrets(text, secrets);
    const rows = await auditRows();
    expect(rows.length).toBeGreaterThan(0);
    assertNoSecrets(rows, secrets);
  });

  it('redacts a credentialed RPC URL from tool responses and audit rows on a dead endpoint', async () => {
    // Separate small fixture + session — deliberately NOT the shared `mcp`
    // from beforeAll, so this doesn't disturb the anvil-backed suite above.
    // viem embeds the full request URL (including any path-embedded provider
    // API key) into HttpRequestError messages, so a vault RPC endpoint with a
    // credential in its path must never reach an agent-visible tool response
    // or an audit row.
    const RPC_TOKEN = 'SUPERSECRETRPCTOKEN';
    const deadRpcUrl = `http://127.0.0.1:9/v3/${RPC_TOKEN}`;

    const fixture = await createVaultFixture({ rpcUrl: deadRpcUrl });
    const server = new ChainVaultServer({
      basePath: fixture.basePath,
      vaultKey: fixture.vaultKeys['workstyle-agent'],
    });
    await server.init();

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'leak-test-client', version: '1.0.0' });
    await server.getMcpServer().connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const text = await callToolText(client, 'get_balance', {
        chain_id: ANVIL_CHAIN_ID,
        address: ANVIL_ACCOUNTS[0].address,
      });
      assertNoSecrets(text, [RPC_TOKEN, deadRpcUrl]);

      const db = new ChainVaultDB(fixture.basePath);
      try {
        const rows = db.getDB().prepare('SELECT * FROM audit_entries').all() as unknown[];
        expect(rows.length).toBeGreaterThan(0);
        assertNoSecrets(rows, [RPC_TOKEN, deadRpcUrl]);
      } finally {
        db.close();
      }
    } finally {
      await client.close();
      await server.getMcpServer().close();
      await fixture.cleanup();
    }
  });
});
