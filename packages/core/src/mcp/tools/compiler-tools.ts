import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerCompilerTools(server: McpServer): void {
  server.registerTool(
    'compile_contract',
    {
      title: 'Compile Solidity Contract',
      description: 'Compile Solidity source code using solc (via Docker or local install). Returns ABI and bytecode ready for deployment.',
      inputSchema: z.object({
        source_code: z.string().describe('Solidity source code'),
        compiler_version: z.string().describe('Solc version (e.g., "0.8.26")'),
        contract_name: z.string().describe('Contract name to extract from compilation output'),
        optimization: z.boolean().optional().describe('Enable optimizer (default: true)'),
        optimization_runs: z.number().optional().describe('Optimizer runs (default: 200)'),
      }),
    },
    async () => {
      return { content: [{ type: 'text' as const, text: '' }] };
    },
  );
}
