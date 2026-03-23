import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';
import { getChainConfig } from '../../chain/chains.js';

type ContextGetter = () => AgentContext | null;

export function registerVaultTools(server: McpServer, getContext: ContextGetter): void {
  server.registerTool(
    'list_chains',
    {
      title: 'List Accessible Chains',
      description: 'Show which blockchain networks this agent has access to',
      inputSchema: z.object({}),
    },
    async () => {
      const ctx = getContext();
      if (!ctx) {
        return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };
      }

      const chains = ctx.config.chains.map((chainId) => {
        const config = getChainConfig(chainId);
        if (config) {
          return {
            chainId: config.chainId,
            name: config.name,
            network: config.network,
            nativeCurrency: config.nativeCurrency.symbol,
          };
        }
        return { chainId, name: 'Unknown', network: 'unknown', nativeCurrency: 'unknown' };
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(chains, null, 2) }] };
    },
  );

  server.registerTool(
    'list_capabilities',
    {
      title: 'List Agent Capabilities',
      description: 'Show what actions this agent is allowed to perform, including transaction types and API access',
      inputSchema: z.object({}),
    },
    async () => {
      const ctx = getContext();
      if (!ctx) {
        return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };
      }

      const capabilities = {
        agent: ctx.config.name,
        chains: ctx.config.chains,
        allowed_types: ctx.config.tx_rules.allowed_types,
        api_access: Object.keys(ctx.config.api_access),
        contract_rules: ctx.config.contract_rules.mode,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(capabilities, null, 2) }] };
    },
  );

  server.registerTool(
    'get_agent_address',
    {
      title: 'Get Agent Wallet Address',
      description: 'Get the wallet address for a given chain. Returns public address only, never private keys.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('The chain ID to get the address for'),
      }),
    },
    async ({ chain_id }) => {
      const ctx = getContext();
      if (!ctx) {
        return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };
      }

      if (!ctx.config.chains.includes(chain_id)) {
        return { content: [{ type: 'text' as const, text: `Agent does not have access to chain ${chain_id}.` }] };
      }

      const key = ctx.keys.find((k) => k.chains.includes(chain_id));
      if (!key) {
        return { content: [{ type: 'text' as const, text: `No key available for chain ${chain_id}.` }] };
      }

      return { content: [{ type: 'text' as const, text: key.address }] };
    },
  );
}
