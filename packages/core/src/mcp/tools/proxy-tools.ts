import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentContext } from '../context.js';
import { getChainConfig } from '../../chain/chains.js';
import { ApiProxy } from '../../proxy/api-proxy.js';

type ContextGetter = () => AgentContext | null;

const proxy = new ApiProxy();

/**
 * Strips potential key material from error messages before returning to agents.
 * Redacts anything that looks like a private key (0x + 64 hex chars).
 */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED]');
}

export function registerProxyTools(server: McpServer, getContext: ContextGetter): void {
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
    async ({ chain_id, module: mod, action, params: extraParams }) => {
      const ctx = getContext();
      if (!ctx) return { content: [{ type: 'text' as const, text: 'No agent context. Set CHAINVAULT_VAULT_KEY.' }] };

      // Find explorer API URL from chain config
      const chainConfig = getChainConfig(chain_id);
      if (!chainConfig?.blockExplorer?.apiUrl) {
        return { content: [{ type: 'text' as const, text: `No block explorer API configured for chain ${chain_id}.` }] };
      }

      // Find API key matching this explorer via controlled accessor
      const explorerApiUrl = chainConfig.blockExplorer.apiUrl;
      const apiKeyMatch = ctx.getApiKeyForExplorer(explorerApiUrl);
      if (!apiKeyMatch) {
        return { content: [{ type: 'text' as const, text: `No API key configured for ${chainConfig.blockExplorer.name}. Add one via the TUI or CLI.` }] };
      }
      const { serviceName, key: apiKeyValue } = apiKeyMatch;

      // Check API access rules
      const apiCheck = ctx.rules.checkApiRequest({ service: serviceName, endpoint: action });
      if (!apiCheck.approved) {
        return { content: [{ type: 'text' as const, text: apiCheck.reason ?? 'API access denied.' }] };
      }

      // Get rate limits from agent config
      const rateLimits = ctx.config.api_access[serviceName]?.rate_limit;

      try {
        const result = await proxy.request({
          baseUrl: explorerApiUrl,
          endpoint: '/api',
          params: { module: mod, action, ...(extraParams ?? {}) },
          apiKey: apiKeyValue,
          rateLimits,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e: unknown) {
        return { content: [{ type: 'text' as const, text: `Error: ${sanitizeError(e)}` }] };
      }
    },
  );

  server.registerTool(
    'query_price',
    {
      title: 'Get Token Price',
      description: 'Get current token price data from CoinGecko',
      inputSchema: z.object({
        token_id: z.string().describe('Token identifier (e.g., "ethereum", "bitcoin")'),
        currency: z.string().optional().describe('Target currency (default: "usd")'),
      }),
    },
    async ({ token_id, currency }) => {
      const cur = currency ?? 'usd';
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(token_id)}&vs_currencies=${encodeURIComponent(cur)}`;
        const response = await fetch(url);
        if (!response.ok) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `CoinGecko API error: ${response.status}` }) }] };
        }
        const data = await response.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e: unknown) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: sanitizeError(e) }) }] };
      }
    },
  );
}
