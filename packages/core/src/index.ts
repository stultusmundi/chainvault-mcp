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
export { EvmAdapter, buildTransport } from './chain/evm-adapter.js';
export type { ChainAdapter } from './chain/types.js';
export {
  SUPPORTED_CHAINS,
  getChainConfig,
  getSupportedChainIds,
  getTestnetChains,
  getMainnetChains,
  getChainsWithFaucets,
} from './chain/chains.js';
export type { ChainConfig, FaucetConfig } from './chain/chains.js';
export { requestFaucet, getFaucetInfo } from './chain/faucet.js';
export type { FaucetResult } from './chain/faucet.js';

// Proxy
export { ApiProxy } from './proxy/api-proxy.js';

// Audit
export { AuditLogger } from './audit/logger.js';

// Database
export { ChainVaultDB } from './db/database.js';
export { SpendStore } from './db/spend-store.js';
export { AuditStore } from './db/audit-store.js';
export type { AuditEntry } from './db/audit-store.js';

// Compiler
export { SolidityCompiler } from './compiler/solidity.js';
export type { CompileResult } from './compiler/solidity.js';

// Auth / WebAuthn
export { DualKeyManager } from './vault/dual-key.js';
export { WebAuthnManager } from './auth/webauthn-server.js';
export { AuthLocalServer } from './auth/local-server.js';

// MCP
export { ChainVaultServer } from './mcp/server.js';

export const VERSION = '0.1.0';
