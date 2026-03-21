import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';

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
      return { content: [{ type: 'text' as const, text: '[]' }] };
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
      return { content: [{ type: 'text' as const, text: '{}' }] };
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
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
