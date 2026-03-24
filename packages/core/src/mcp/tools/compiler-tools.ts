import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuditFn } from '../audit-fn.js';
import { compile } from '../../compiler/solidity.js';

/**
 * Strips potential key material from error messages before returning to agents.
 * Redacts anything that looks like a private key (0x + 64 hex chars).
 */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED]');
}

const noop: AuditFn = () => {};

export function registerCompilerTools(server: McpServer, audit: AuditFn = noop): void {
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
        audit({ action: 'compile_contract', status: 'approved', details: `Compiled ${contract_name} (solc ${compiler_version})` });
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
      } catch (e: unknown) {
        const msg = sanitizeError(e);
        audit({ action: 'compile_contract', status: 'approved', details: `Error: ${msg.slice(0, 100)}` });
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
