import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compileCorpusContract, compilerAvailable } from '../helpers/corpus.js';
import { createVaultFixture, type VaultFixture } from '../helpers/vault-fixture.js';
import { connectMcp, callToolJson, callToolText, type WorkstyleMcp } from '../helpers/mcp.js';
import { AnvilHarness } from '../helpers/anvil.js';

const SEPOLIA = 11155111;
const SEPOLIA_RPC = process.env.TESTNET_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const MIN_BALANCE_ETH = 0.02;

const key = process.env.TESTNET_PRIVATE_KEY;
let funded = false;
if (key) {
  const account = privateKeyToAccount(key as `0x${string}`);
  const client = createPublicClient({ transport: http(SEPOLIA_RPC) });
  try {
    const balance = await client.getBalance({ address: account.address });
    funded = Number(formatEther(balance)) >= MIN_BALANCE_ETH;
    if (!funded) {
      console.warn(`SKIP testnet: ${account.address} holds < ${MIN_BALANCE_ETH} ETH — see docs/testnet-runbook.md`);
    }
  } catch (err) {
    console.warn(`SKIP testnet: Sepolia RPC unreachable (${String(err)}) — transient? see docs/testnet-runbook.md`);
  }
}
const ready = Boolean(key) && funded && (await compilerAvailable());

describe.skipIf(!ready)('Sepolia live smoke', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    const fixture: VaultFixture = await createVaultFixture({
      rpcUrl: SEPOLIA_RPC,
      chainId: SEPOLIA,
      keys: { 'testnet-key': { privateKey: key!, chains: [SEPOLIA] } },
      apiKeys: process.env.ETHERSCAN_API_KEY
        ? { etherscan: { key: process.env.ETHERSCAN_API_KEY, baseUrl: 'https://api-sepolia.etherscan.io' } }
        : {},
      agents: [{
        name: 'testnet-agent',
        chains: [SEPOLIA],
        limits: { [String(SEPOLIA)]: { max_per_tx: '0.005', daily_limit: '0.01', monthly_limit: '0.05' } },
        grantApis: process.env.ETHERSCAN_API_KEY ? ['etherscan'] : [],
      }],
    });
    // No anvil here — a placeholder harness is never started; connectMcp only
    // needs it for the return shape, so pass a stopped stand-in.
    mcp = await connectMcp({ stop: async () => {}, rpcUrl: SEPOLIA_RPC, chainId: SEPOLIA } as unknown as AnvilHarness, fixture, 'testnet-agent');
  });

  afterAll(async () => {
    await mcp.close();
  });

  let tokenAddress: string;
  let tokenAbi: string;
  let deployHash: string;

  it('deploys TestToken on Sepolia', async () => {
    const { abi, bytecode } = await compileCorpusContract('TestToken');
    tokenAbi = JSON.stringify(abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: SEPOLIA, abi: tokenAbi, bytecode,
      constructor_args: ['Workstyle Live', 'WSL', '1000000'],
    });
    expect(deploy.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    tokenAddress = deploy.contractAddress;
    deployHash = deploy.hash;
  });

  it('interacts and reads events back', async () => {
    const account = privateKeyToAccount(key! as `0x${string}`);
    const write = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: SEPOLIA, address: tokenAddress, abi: tokenAbi,
      function_name: 'transfer', args: [account.address, '1'],
    });
    expect(write.hash).toMatch(/^0x/);
    const tx = await callToolJson(mcp.client, 'get_transaction', {
      chain_id: SEPOLIA, hash: write.hash,
    });
    expect(tx.receipt.status).toBe('success');
  });

  it.skipIf(!process.env.ETHERSCAN_API_KEY)('verifies the contract on Etherscan (real verify_contract)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'TestToken.sol'), 'utf8',
    );
    const text = await callToolText(mcp.client, 'verify_contract', {
      chain_id: SEPOLIA, address: tokenAddress, source_code: source,
      contract_name: 'TestToken', compiler_version: 'v0.8.24+commit.e11b9ed9',
      optimization: true,
    });
    // Etherscan verification is async — accept submitted/pending/already-verified outcomes
    expect(text.toLowerCase()).toMatch(/guid|pending|submitted|verified|ok/);
  });

  it.skipIf(!process.env.ETHERSCAN_API_KEY)('query_explorer fetches the deploy tx through the vault API key', async () => {
    const text = await callToolText(mcp.client, 'query_explorer', {
      chain_id: SEPOLIA, module: 'proxy', action: 'eth_getTransactionByHash',
      params: { txhash: deployHash },
    });
    expect(text.toLowerCase()).toContain(tokenAddress.toLowerCase().slice(2, 10));
  });

  it('query_price returns ETH price data', async () => {
    const text = await callToolText(mcp.client, 'query_price', { token_id: 'ethereum' });
    expect(text).toMatch(/usd|price|\d/i);
  });
});
