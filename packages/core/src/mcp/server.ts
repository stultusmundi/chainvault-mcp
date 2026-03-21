import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVaultTools } from './tools/vault-tools.js';
import { registerChainTools } from './tools/chain-tools.js';
import { registerProxyTools } from './tools/proxy-tools.js';
import { registerCompilerTools } from './tools/compiler-tools.js';
import { registerChainRegistryTools } from './tools/chain-registry-tools.js';
import { createAgentContext, type AgentContext } from './context.js';

interface ServerConfig {
  basePath: string;
  vaultKey?: string;
}

export class ChainVaultServer {
  private mcpServer: McpServer;
  private registeredTools: string[] = [];
  private config: ServerConfig;
  private agentContext: AgentContext | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
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

  async init(): Promise<void> {
    this.agentContext = await createAgentContext(
      this.config.basePath,
      this.config.vaultKey || process.env.CHAINVAULT_VAULT_KEY,
    );
  }

  private registerAllTools(): void {
    // We track tool names by wrapping registration
    const originalRegister = this.mcpServer.registerTool.bind(this.mcpServer);
    this.mcpServer.registerTool = ((name: string, ...args: any[]) => {
      this.registeredTools.push(name);
      return (originalRegister as any)(name, ...args);
    }) as any;

    const getContext = () => this.agentContext;

    registerVaultTools(this.mcpServer, getContext);
    registerChainTools(this.mcpServer, getContext);
    registerProxyTools(this.mcpServer);
    registerCompilerTools(this.mcpServer);
    registerChainRegistryTools(this.mcpServer);

    // Restore original
    this.mcpServer.registerTool = originalRegister;
  }

  getRegisteredToolNames(): string[] {
    return [...this.registeredTools];
  }

  getAgentContext(): AgentContext | null {
    return this.agentContext;
  }

  getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
