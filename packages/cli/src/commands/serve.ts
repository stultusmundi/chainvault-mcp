import { ChainVaultServer } from '@chainvault/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function serve(basePath: string): Promise<void> {
  const server = new ChainVaultServer({ basePath });
  await server.init();
  const transport = new StdioServerTransport();
  await server.getMcpServer().connect(transport);
  const ctx = server.getAgentContext();
  if (ctx) {
    console.error(`ChainVault MCP server running on stdio (agent: ${ctx.agentName})`);
  } else {
    console.error('ChainVault MCP server running on stdio (no agent context)');
  }
}
