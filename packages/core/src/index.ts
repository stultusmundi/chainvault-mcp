// Vault
export { MasterVault } from './vault/master-vault.js';
export { AgentVaultManager } from './vault/agent-vault.js';
export {
  encrypt,
  decrypt,
  deriveKeyFromPassword,
  generateRandomKey,
  generateVaultKeyString,
} from './vault/crypto.js';
export type {
  MasterVaultData,
  AgentVaultData,
  AgentConfig,
  TxRules,
  ApiAccessRule,
} from './vault/types.js';

// Rules
export { RulesEngine } from './rules/engine.js';
export type { TxRequest, ApiRequest, RuleResult } from './rules/engine.js';

// Chain
export { EvmAdapter } from './chain/evm-adapter.js';
export type { ChainAdapter } from './chain/types.js';

// Proxy
export { ApiProxy } from './proxy/api-proxy.js';

// Audit
export { AuditLogger } from './audit/logger.js';

// Database
export { ChainVaultDB } from './db/database.js';
export { SpendStore } from './db/spend-store.js';
export { AuditStore } from './db/audit-store.js';
export type { AuditEntry } from './db/audit-store.js';

// MCP
export { ChainVaultServer } from './mcp/server.js';

export const VERSION = '0.1.0';
