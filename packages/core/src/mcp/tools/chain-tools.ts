import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EvmAdapter } from '../../chain/evm-adapter.js';
import type { AgentContext } from '../context.js';

type ContextGetter = () => AgentContext | null;

function checkChainAccess(ctx: AgentContext | null, chainId: number): string | null {
  if (!ctx) return 'No agent context. Set CHAINVAULT_VAULT_KEY.';
  const result = ctx.rules.checkTxRequest({ type: 'read', chain_id: chainId, value: '0' });
  if (!result.approved) return result.reason ?? `Agent does not have access to chain ${chainId}.`;
  return null;
}

export function registerChainTools(server: McpServer, getContext: ContextGetter): void {
  // ---------------------------------------------------------------------------
  // Tier 2 stubs (not yet wired)
  // ---------------------------------------------------------------------------

  server.registerTool(
    'deploy_contract',
    {
      title: 'Deploy Smart Contract',
      description: 'Deploy compiled bytecode to a blockchain. Checks rules, estimates gas, and returns deployment hash and contract address.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Target chain ID'),
        abi: z.string().describe('Contract ABI as JSON string'),
        bytecode: z.string().describe('Compiled contract bytecode (0x-prefixed)'),
        constructor_args: z.array(z.any()).optional().describe('Constructor arguments'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: 'Not yet implemented. Coming in Tier 2.' }] };
    },
  );

  server.registerTool(
    'interact_contract',
    {
      title: 'Write to Smart Contract',
      description: 'Call a state-changing function on a deployed contract. Simulates first, then sends if safe.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Target chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('Function to call'),
        args: z.array(z.any()).optional().describe('Function arguments'),
        value: z.string().optional().describe('Native token value to send (in ETH)'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: 'Not yet implemented. Coming in Tier 2.' }] };
    },
  );

  server.registerTool(
    'verify_contract',
    {
      title: 'Verify Contract Source',
      description: 'Verify contract source code on a block explorer (e.g., Etherscan)',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Deployed contract address'),
        source_code: z.string().describe('Solidity source code'),
        contract_name: z.string().describe('Contract name'),
        compiler_version: z.string().describe('Solidity compiler version'),
        optimization: z.boolean().optional().describe('Whether optimization was enabled'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: 'Not yet implemented. Coming in Tier 2.' }] };
    },
  );

  // ---------------------------------------------------------------------------
  // Tier 1 wired tools
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_balance',
    {
      title: 'Get Balance',
      description: 'Get native token balance (e.g., ETH) for an address on a specific chain',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Wallet or contract address'),
      }),
    },
    async ({ chain_id, address }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const balance = await adapter.getBalance(address);
        return { content: [{ type: 'text' as const, text: JSON.stringify(balance, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'get_contract_state',
    {
      title: 'Read Contract State',
      description: 'Call a read-only function on a smart contract',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('View/pure function to call'),
        args: z.array(z.any()).optional().describe('Function arguments'),
      }),
    },
    async ({ chain_id, address, abi, function_name, args }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const parsedAbi = JSON.parse(abi);
        const adapter = EvmAdapter.fromChainId(chain_id);
        const result = await adapter.readContract({
          address,
          abi: parsedAbi,
          functionName: function_name,
          args: args ?? [],
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ result }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'simulate_transaction',
    {
      title: 'Simulate Transaction',
      description: 'Simulate a contract call without sending it on-chain. Returns estimated gas and potential errors.',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        function_name: z.string().describe('Function to simulate'),
        args: z.array(z.any()).optional().describe('Function arguments'),
        value: z.string().optional().describe('Native token value (in ETH)'),
      }),
    },
    async ({ chain_id, address, abi, function_name, args, value }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const agentKey = ctx!.keys.find((k) => k.chains.includes(chain_id));
        if (!agentKey) {
          return { content: [{ type: 'text' as const, text: `No key available for chain ${chain_id}.` }] };
        }

        const parsedAbi = JSON.parse(abi);
        const adapter = EvmAdapter.fromChainId(chain_id);
        const result = await adapter.simulateTransaction({
          address,
          abi: parsedAbi,
          functionName: function_name,
          args: args ?? [],
          account: agentKey.address,
          value,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'get_events',
    {
      title: 'Get Contract Events',
      description: 'Query event logs from a smart contract with optional filters',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        address: z.string().describe('Contract address'),
        abi: z.string().describe('Contract ABI as JSON string'),
        event_name: z.string().describe('Event name to filter'),
        from_block: z.number().optional().describe('Start block number'),
        to_block: z.number().optional().describe('End block number'),
      }),
    },
    async ({ chain_id, address, abi, event_name, from_block, to_block }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const parsedAbi = JSON.parse(abi);
        const adapter = EvmAdapter.fromChainId(chain_id);
        const events = await adapter.getEvents({
          address,
          abi: parsedAbi,
          eventName: event_name,
          fromBlock: from_block !== undefined ? BigInt(from_block) : undefined,
          toBlock: to_block !== undefined ? BigInt(to_block) : undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'get_transaction',
    {
      title: 'Get Transaction Details',
      description: 'Get transaction details and receipt by transaction hash',
      inputSchema: z.object({
        chain_id: z.number().int().describe('Chain ID'),
        hash: z.string().describe('Transaction hash'),
      }),
    },
    async ({ chain_id, hash }) => {
      const ctx = getContext();
      const err = checkChainAccess(ctx, chain_id);
      if (err) return { content: [{ type: 'text' as const, text: err }] };

      try {
        const adapter = EvmAdapter.fromChainId(chain_id);
        const tx = await adapter.getTransaction(hash);
        return { content: [{ type: 'text' as const, text: JSON.stringify(tx, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );
}
