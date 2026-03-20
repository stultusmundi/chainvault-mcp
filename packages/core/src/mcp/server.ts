import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVaultTools } from './tools/vault-tools.js';
import { registerChainTools } from './tools/chain-tools.js';
import { registerProxyTools } from './tools/proxy-tools.js';
import { registerCompilerTools } from './tools/compiler-tools.js';
import { registerChainRegistryTools } from './tools/chain-registry-tools.js';

interface ServerConfig {
  basePath: string;
}

export class ChainVaultServer {
  private mcpServer: McpServer;
  private registeredTools: string[] = [];

  constructor(config: ServerConfig) {
    this.mcpServer = new McpServer(
      {
        name: 'chainvault-mcp',
        version: '0.1.0',
      },
      {
        capabilities: { logging: {} },
      },
    );

    this.registerAllTools();
  }

  private registerAllTools(): void {
    // We track tool names by wrapping registration
    const originalRegister = this.mcpServer.registerTool.bind(this.mcpServer);
    this.mcpServer.registerTool = ((name: string, ...args: any[]) => {
      this.registeredTools.push(name);
      return (originalRegister as any)(name, ...args);
    }) as any;

    registerVaultTools(this.mcpServer);
    registerChainTools(this.mcpServer);
    registerProxyTools(this.mcpServer);
    registerCompilerTools(this.mcpServer);
    registerChainRegistryTools(this.mcpServer);

    // Restore original
    this.mcpServer.registerTool = originalRegister;
  }

  getRegisteredToolNames(): string[] {
    return [...this.registeredTools];
  }

  getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
