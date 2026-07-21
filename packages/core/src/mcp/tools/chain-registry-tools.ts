import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuditFn } from '../audit-fn.js';
import type { AgentContext } from '../context.js';
import { SUPPORTED_CHAINS, getChainConfig, getChainsWithFaucets } from '../../chain/chains.js';
import { requestFaucet, getFaucetInfo } from '../../chain/faucet.js';

type ContextGetter = () => AgentContext | null;
const noop: AuditFn = () => {};
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function registerChainRegistryTools(server: McpServer, getContext: ContextGetter, audit: AuditFn = noop): void {
  server.registerTool(
    'list_supported_chains',
    {
      title: 'List Supported Chains',
      description: 'List all supported EVM blockchain networks with their chain IDs, native currencies, RPC availability, and faucet status. Use this to discover which chains are available before interacting with them.',
      inputSchema: z.object({
        network: z.enum(['mainnet', 'testnet', 'all']).optional().describe('Filter by network type (default: all)'),
      }),
    },
    async ({ network }) => {
      let chains = [...SUPPORTED_CHAINS];
      if (network === 'mainnet') chains = chains.filter((c) => c.network === 'mainnet');
      if (network === 'testnet') chains = chains.filter((c) => c.network === 'testnet');

      const result = chains.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        network: c.network,
        nativeCurrency: c.nativeCurrency.symbol,
        hasWebSocket: (c.rpcUrls.websocket?.length ?? 0) > 0,
        hasFaucet: (c.faucets?.length ?? 0) > 0,
        blockExplorer: c.blockExplorer?.url ?? null,
      }));

      audit({ action: 'list_supported_chains', status: 'approved', details: `Listed ${result.length} chains (filter: ${network ?? 'all'})` });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  server.registerTool(
    'request_faucet',
    {
      title: 'Request Testnet Funds',
      description: 'Request testnet tokens from a faucet. Attempts programmatic request first, falls back to providing a faucet URL if programmatic access is unavailable.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID of the testnet'),
        address: z.string().describe('Wallet address to receive testnet funds'),
      }),
    },
    async ({ chain_id, address }) => {
      const ctx = getContext();
      if (!ctx) {
        audit({ action: 'request_faucet', chain_id, status: 'denied', details: 'No agent context' });
        return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };
      }
      // The agent must have access to this chain (mirrors read gating).
      const access = ctx.rules.checkTxRequest({ type: 'read', chain_id, value: '0' });
      if (!access.approved) {
        const reason = access.reason ?? `Agent does not have access to chain ${chain_id}.`;
        audit({ action: 'request_faucet', chain_id, status: 'denied', details: reason });
        return { content: [{ type: 'text' as const, text: reason }] };
      }
      if (!ADDRESS_PATTERN.test(address)) {
        audit({ action: 'request_faucet', chain_id, status: 'denied', details: 'Invalid recipient address' });
        return { content: [{ type: 'text' as const, text: `Invalid recipient address: ${JSON.stringify(address)}` }] };
      }

      const result = await requestFaucet(chain_id, address);
      audit({ action: 'request_faucet', chain_id, status: 'approved', details: `Faucet request for chain ${chain_id}` });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
