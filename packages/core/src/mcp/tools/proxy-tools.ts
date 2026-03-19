import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerProxyTools(server: McpServer): void {
  server.registerTool(
    'query_explorer',
    {
      title: 'Query Block Explorer',
      description: 'Query a block explorer API (e.g., Etherscan) for contract ABIs, source code, transaction history, etc.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        module: z.string().describe('API module (e.g., "contract", "account", "transaction")'),
        action: z.string().describe('API action (e.g., "getabi", "getsourcecode", "txlist")'),
        params: z.record(z.string(), z.string()).optional().describe('Additional query parameters'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );

  server.registerTool(
    'query_price',
    {
      title: 'Get Token Price',
      description: 'Get current token price data from CoinGecko or similar price API',
      inputSchema: z.object({
        token_id: z.string().describe('Token identifier (e.g., "ethereum", "bitcoin")'),
        currency: z.string().optional().describe('Target currency (default: "usd")'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
