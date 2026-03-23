import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compile } from '../../compiler/solidity.js';

export function registerCompilerTools(server: McpServer): void {
  server.registerTool(
    'compile_contract',
    {
      title: 'Compile Solidity Contract',
      description: 'Compile Solidity source code using solc (via Docker or local install). Returns ABI and bytecode.',
      inputSchema: z.object({
        source_code: z.string().describe('Solidity source code'),
        compiler_version: z.string().describe('Solc version (e.g., "0.8.20")'),
        contract_name: z.string().describe('Contract name to extract'),
        optimization: z.boolean().optional().describe('Enable optimizer (default: true)'),
        optimization_runs: z.number().optional().describe('Optimizer runs (default: 200)'),
      }),
    },
    async ({ source_code, compiler_version, contract_name, optimization, optimization_runs }) => {
      try {
        const result = await compile(
          source_code,
          compiler_version,
          contract_name,
          optimization ?? true,
          optimization_runs ?? 200,
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              abi: result.abi,
              bytecode: result.bytecode,
              warnings: result.warnings,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        const msg = e.message || String(e);
        if (msg.includes('docker') || msg.includes('solc') || msg.includes('ENOENT') || msg.includes('not found')) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Solidity compiler not available. Run 'chainvault solc pull ${compiler_version}' or install solc locally. Details: ${msg}`,
              }),
            }],
          };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
      }
    },
  );
}
