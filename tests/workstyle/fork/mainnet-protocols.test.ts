import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encodeFunctionData } from 'viem';
import { anvilAvailable, ANVIL_ACCOUNTS } from '../helpers/anvil.js';
import { compileCorpusContract, compilerAvailable } from '../helpers/corpus.js';
import { startWorkstyleMcp, callToolJson, type WorkstyleMcp } from '../helpers/mcp.js';
import { FORK_BLOCK, FORK_URL, FORK_ENABLED, MAINNET, WETH_ABI, ERC20_MIN_ABI, QUOTER_V1_ABI } from './fork-targets.js';

const ready = FORK_ENABLED && anvilAvailable() && (await compilerAvailable());
const CHAIN = 1; // fork keeps mainnet chain id

describe.skipIf(!ready)('real mainnet protocols on an anvil fork', () => {
  let mcp: WorkstyleMcp;

  beforeAll(async () => {
    mcp = await startWorkstyleMcp({
      anvil: { forkUrl: FORK_URL, forkBlock: FORK_BLOCK },
      chainId: CHAIN,
      agents: [{ name: 'forker', chains: [CHAIN] }],
    });

    // The well-known anvil dev mnemonic ("test test ... junk") is public, and
    // some of its addresses have been griefed on real mainnet with EIP-7702
    // delegation designators (0xef0100...) pointing at contracts that revert
    // or exceed the 2300-gas stipend used by legacy low-level `.transfer()`
    // calls (e.g. WETH9.withdraw). Forking mainnet inherits that delegated
    // code, breaking otherwise-plain-EOA assumptions. Strip it so the dev
    // accounts behave as plain EOAs, matching every other anvil-mode test.
    for (const acct of ANVIL_ACCOUNTS) {
      await mcp.anvil.rpc('anvil_setCode', [acct.address, '0x']);
    }
  });

  afterAll(async () => {
    await mcp.close();
  });

  it('routes chain 1 through the vault RPC endpoint (fork), not the public registry', async () => {
    // The agent's anvil account holds 10,000 ETH on the fork — a balance the
    // real mainnet address does not have. Seeing it proves the fork routing.
    const balance = await callToolJson(mcp.client, 'get_balance', {
      chain_id: CHAIN, address: ANVIL_ACCOUNTS[0].address,
    });
    expect(BigInt(balance.wei)).toBe(10_000n * 10n ** 18n);
  });

  it('WETH9 deposit/withdraw round-trip through MCP tools', async () => {
    const wethAbi = JSON.stringify(WETH_ABI);
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'deposit', args: [], value: '1',
    });
    const afterDeposit = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[0].address],
    });
    expect(JSON.stringify(afterDeposit)).toContain('1000000000000000000');

    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.WETH9, abi: wethAbi,
      function_name: 'withdraw', args: ['1000000000000000000'],
    });
  });

  it('USDT non-standard returns do not break approve/transfer handling', async () => {
    // Fund the agent with real USDT from an impersonated whale
    await mcp.anvil.impersonate(MAINNET.WHALE);
    const fundHash = await mcp.anvil.rpc<string>('eth_sendTransaction', [{
      from: MAINNET.WHALE,
      to: MAINNET.USDT,
      data: encodeFunctionData({
        abi: ERC20_MIN_ABI, functionName: 'transfer',
        args: [ANVIL_ACCOUNTS[0].address, 1_000_000_000n], // 1000 USDT (6 decimals)
      }),
    }]);
    // Raw RPC send, so it bypasses the settling done by callToolJson.
    await mcp.anvil.waitForTx(fundHash);

    const usdtAbi = JSON.stringify(ERC20_MIN_ABI);
    const approve = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'approve', args: [MAINNET.WETH9, '500000000'],
    });
    expect(approve.hash).toMatch(/^0x/);

    const transfer = await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '250000000'],
    });
    expect(transfer.hash).toMatch(/^0x/);

    const balance = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.USDT, abi: usdtAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(balance)).toContain('250000000');
  });

  it('USDC reads resolve through its proxy', async () => {
    const decimals = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: MAINNET.USDC, abi: JSON.stringify(ERC20_MIN_ABI),
      function_name: 'decimals', args: [],
    });
    expect(JSON.stringify(decimals)).toContain('6');
  });

  it('Uniswap V3 quoter runs via simulate_transaction (nonpayable read)', async () => {
    const sim = await callToolJson(mcp.client, 'simulate_transaction', {
      chain_id: CHAIN, address: MAINNET.UNISWAP_V3_QUOTER_V1, abi: JSON.stringify(QUOTER_V1_ABI),
      function_name: 'quoteExactInputSingle',
      args: [MAINNET.WETH9, MAINNET.USDC, '3000', '1000000000000000000', '0'],
    });
    expect(sim.success).toBe(true);
    // amountOut is USDC (6 decimals) for 1 WETH — sanity: > 100 USDC
    expect(BigInt(String(sim.result))).toBeGreaterThan(100_000_000n);
  });

  it('fee-on-transfer token: received < sent, reads report actuals', async () => {
    const fee = await compileCorpusContract('FeeToken');
    const feeAbi = JSON.stringify(fee.abi);
    const deploy = await callToolJson(mcp.client, 'deploy_contract', {
      chain_id: CHAIN, abi: feeAbi, bytecode: fee.bytecode,
      constructor_args: ['1000000000000000000000'], // 1000 FEE
    });
    await callToolJson(mcp.client, 'interact_contract', {
      chain_id: CHAIN, address: deploy.contractAddress, abi: feeAbi,
      function_name: 'transfer', args: [ANVIL_ACCOUNTS[1].address, '100000000000000000000'], // send 100
    });
    const received = await callToolJson(mcp.client, 'get_contract_state', {
      chain_id: CHAIN, address: deploy.contractAddress, abi: feeAbi,
      function_name: 'balanceOf', args: [ANVIL_ACCOUNTS[1].address],
    });
    expect(JSON.stringify(received)).toContain('98000000000000000000'); // 100 - 2%
  });
});
