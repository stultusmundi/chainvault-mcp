import { ChainVaultServer } from '@chainvault/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function serve(basePath: string): Promise<void> {
  const server = new ChainVaultServer({ basePath });
  const transport = new StdioServerTransport();
  await server.getMcpServer().connect(transport);
  console.error('ChainVault MCP server running on stdio');
}
