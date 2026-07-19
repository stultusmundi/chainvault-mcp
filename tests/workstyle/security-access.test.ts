import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MasterVault, AgentVaultManager, EvmAdapter } from '@chainvault/core';
import { ChainVaultDB } from '../../packages/core/src/db/database.js';
import { AnvilHarness, ANVIL_ACCOUNTS, ANVIL_CHAIN_ID, anvilAvailable } from './helpers/anvil.js';
import { createVaultFixture, type VaultFixture } from './helpers/vault-fixture.js';
import { compileCorpusContract, compilerAvailable } from './helpers/corpus.js';
import { connectMcp, callToolText, callToolJson, type WorkstyleMcp } from './helpers/mcp.js';

const ready = anvilAvailable() && (await compilerAvailable());

describe.skipIf(!ready)('access control under real conditions', () => {
  let anvil: AnvilHarness;
  let fixture: VaultFixture;
  let tokenAddress: string;
  let vaultAddress: string;
  let tokenAbi: string;
  let payableAbi: string;
  const sessions: WorkstyleMcp[] = [];

  beforeAll(async () => {
    anvil = await AnvilHarness.start();
    // Pre-deploy targets directly so whitelist addresses are known at fixture time
    const adapter = new EvmAdapter(anvil.rpcUrl, ANVIL_CHAIN_ID);
    const token = await compileCorpusContract('TestToken');
    const payable = await compileCorpusContract('PayableVault');
    tokenAbi = JSON.stringify(token.abi);
    payableAbi = JSON.stringify(payable.abi);
    tokenAddress = (await adapter.deployContract({
      abi: token.abi, bytecode: token.bytecode, args: ['T', 'T', 1000n],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    })).address!;
    vaultAddress = (await adapter.deployContract({
      abi: payable.abi, bytecode: payable.bytecode, args: [],
      privateKey: ANVIL_ACCOUNTS[0].privateKey,
    })).address!;

    fixture = await createVaultFixture({
      rpcUrl: anvil.rpcUrl,
      agents: [
        { name: 'admin' },
        { name: 'reader', allowedTypes: ['read', 'simulate'] },
        { name: 'nokey', grantKeys: [] },
        { name: 'whitelisted', contractRules: { mode: 'whitelist', addresses: [tokenAddress] } },
      ],
    });
  });

  afterAll(async () => {
    for (const s of sessions) {
      await s.client.close();
      await s.server.getMcpServer().close();
    }
    await fixture.cleanup();
    await anvil.stop();
  });

  async function connect(agent: string): Promise<WorkstyleMcp> {
    const s = await connectMcp(anvil, fixture, agent);
    sessions.push(s);
    return s;
  }

  it('denies disallowed tx types for a read-only agent', async () => {
    const reader = await connect('reader');
    const text = await callToolText(reader.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain("not allowed");
  });

  it('denies chains outside the agent grant before touching any RPC', async () => {
    const admin = await connect('admin');
    const text = await callToolText(admin.client, 'deploy_contract', {
      chain_id: 1, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('chain 1');
  });

  it('agent without a granted key cannot write even with permissive rules', async () => {
    const nokey = await connect('nokey');
    const text = await callToolText(nokey.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    expect(text).toContain('No key available');
  });

  it('contract whitelist allows the listed address and denies others', async () => {
    const wl = await connect('whitelisted');
    const ok = await callToolJson(wl.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '1'],
    });
    expect(ok.hash).toMatch(/^0x/);

    const denied = await callToolText(wl.client, 'interact_contract', {
      chain_id: ANVIL_CHAIN_ID, address: vaultAddress, abi: payableAbi,
      function_name: 'deposit', args: [], value: '0.1',
    });
    expect(denied.toLowerCase()).toContain('whitelist');
  });

  it('attributes audit rows to the correct agent name across two agents', async () => {
    const reader = await connect('reader');
    const adminAgent = await connect('admin');

    // reader: denied (read-only agent cannot deploy)
    await callToolText(reader.client, 'deploy_contract', {
      chain_id: ANVIL_CHAIN_ID, abi: tokenAbi, bytecode: '0x00', constructor_args: [],
    });
    // admin: approved (full-permission agent can read balance)
    await callToolText(adminAgent.client, 'get_balance', {
      chain_id: ANVIL_CHAIN_ID, address: ANVIL_ACCOUNTS[0].address,
    });

    const db = new ChainVaultDB(fixture.basePath);
    try {
      const readerRows = db.getDB()
        .prepare('SELECT * FROM audit_entries WHERE agent = ?')
        .all('reader') as Array<{ agent: string; action: string; status: string; chain_id: number }>;
      const adminRows = db.getDB()
        .prepare('SELECT * FROM audit_entries WHERE agent = ?')
        .all('admin') as Array<{ agent: string; action: string; status: string; chain_id: number }>;

      expect(readerRows.every((r) => r.agent === 'reader')).toBe(true);
      expect(adminRows.every((r) => r.agent === 'admin')).toBe(true);
      expect(readerRows.some((r) => r.action === 'deploy_contract' && r.status === 'denied')).toBe(true);
      expect(adminRows.some((r) => r.action === 'get_balance' && r.status === 'approved')).toBe(true);
      // Cross-check: reader never calls get_balance in this suite, and admin's
      // only deploy_contract attempt targets chain 1 (not ANVIL_CHAIN_ID) — so
      // neither agent's bucket should pick up the other's specific row.
      expect(readerRows.some((r) => r.action === 'get_balance')).toBe(false);
      expect(adminRows.some((r) => r.action === 'deploy_contract' && r.chain_id === ANVIL_CHAIN_ID)).toBe(false);
    } finally {
      db.close();
    }
  });

  it('rotation invalidates the old vault key for new connections', async () => {
    const master = await MasterVault.unlock(fixture.basePath, fixture.password);
    try {
      const manager = new AgentVaultManager(fixture.basePath, master);
      const rotated = await manager.rotateAgentKey('admin', fixture.vaultKeys['admin']);
      const oldKey = fixture.vaultKeys['admin'];
      fixture.vaultKeys['admin'] = rotated.vaultKey;

      await expect(connectMcp(anvil, { ...fixture, vaultKeys: { admin: oldKey } }, 'admin'))
        .rejects.toThrow();
      const fresh = await connect('admin'); // new key works
      const text = await callToolText(fresh.client, 'list_chains', {});
      expect(text).toContain('31337');
    } finally {
      master.lock();
    }
  });

  it('revocation makes the vault unopenable for new connections', async () => {
    const master = await MasterVault.unlock(fixture.basePath, fixture.password);
    try {
      const manager = new AgentVaultManager(fixture.basePath, master);
      await manager.revokeAgent('nokey');
    } finally {
      master.lock();
    }
    await expect(connectMcp(anvil, fixture, 'nokey')).rejects.toThrow();
    // Semantics note (by design): revocation applies at connection/init time.
    // A long-running `chainvault serve` process must be restarted to drop
    // an already-loaded context — matches the serve lifecycle.
  });
});
