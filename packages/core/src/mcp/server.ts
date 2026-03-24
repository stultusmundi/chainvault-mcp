import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVaultTools } from './tools/vault-tools.js';
import { registerChainTools } from './tools/chain-tools.js';
import { registerProxyTools } from './tools/proxy-tools.js';
import { registerCompilerTools } from './tools/compiler-tools.js';
import { registerChainRegistryTools } from './tools/chain-registry-tools.js';
import { createAgentContext, type AgentContext } from './context.js';
import { ChainVaultDB } from '../db/database.js';
import { AuditStore } from '../db/audit-store.js';
import type { AuditFn } from './audit-fn.js';

interface ServerConfig {
  basePath: string;
  vaultKey?: string;
}

export class ChainVaultServer {
  private mcpServer: McpServer;
  private registeredTools: string[] = [];
  private config: ServerConfig;
  private agentContext: AgentContext | null = null;
  private auditStore: AuditStore | null = null;
  private db: ChainVaultDB | null = null;

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

    this.db = new ChainVaultDB(this.config.basePath);
    this.auditStore = new AuditStore(this.db);
  }

  private registerAllTools(): void {
    // We track tool names by wrapping registration
    const originalRegister = this.mcpServer.registerTool.bind(this.mcpServer);
    this.mcpServer.registerTool = ((name: string, ...args: any[]) => {
      this.registeredTools.push(name);
      return (originalRegister as any)(name, ...args);
    }) as any;

    const getContext = () => this.agentContext;

    // Lazy audit function — resolves agent name and AuditStore at call time
    // so it works even though tools are registered before init() is called.
    const audit: AuditFn = (entry) => {
      if (!this.auditStore) return;
      const agentName = this.agentContext?.agentName ?? 'unknown';
      this.auditStore.log({
        agent: agentName,
        action: entry.action,
        chain_id: entry.chain_id ?? 0,
        status: entry.status,
        details: entry.details,
      });
    };

    registerVaultTools(this.mcpServer, getContext, audit);
    registerChainTools(this.mcpServer, getContext, audit);
    registerProxyTools(this.mcpServer, getContext, audit);
    registerCompilerTools(this.mcpServer, audit);
    registerChainRegistryTools(this.mcpServer, audit);

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
