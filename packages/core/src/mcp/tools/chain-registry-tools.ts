import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SUPPORTED_CHAINS, getChainConfig, getChainsWithFaucets } from '../../chain/chains.js';
import { requestFaucet, getFaucetInfo } from '../../chain/faucet.js';

export function registerChainRegistryTools(server: McpServer): void {
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
      const result = await requestFaucet(chain_id, address);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
