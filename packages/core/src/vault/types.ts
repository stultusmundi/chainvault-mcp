import { z } from 'zod';

// --- Transaction Types ---

export const TxType = z.enum(['deploy', 'write', 'transfer', 'read', 'simulate']);
export type TxType = z.infer<typeof TxType>;

// --- Limits ---

const LimitValue = z.union([z.literal('unlimited'), z.string().regex(/^\d+\.?\d*$/)]);

const ChainLimits = z.object({
  max_per_tx: LimitValue,
  daily_limit: LimitValue,
  monthly_limit: LimitValue,
});

// --- Rules ---

export const TxRulesSchema = z.object({
  allowed_types: z.array(TxType),
  limits: z.record(z.string(), ChainLimits), // key is chain ID as string
});
export type TxRules = z.infer<typeof TxRulesSchema>;

export const ApiAccessRuleSchema = z.object({
  allowed_endpoints: z.array(z.string()),
  rate_limit: z.object({
    per_second: z.number().int().positive(),
    daily: z.number().int().positive(),
  }),
});
export type ApiAccessRule = z.infer<typeof ApiAccessRuleSchema>;

const ContractRulesSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('whitelist'), addresses: z.array(z.string()) }),
  z.object({ mode: z.literal('blacklist'), addresses: z.array(z.string()) }),
]);

// --- Agent Config ---

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  chains: z.array(z.number().int()),
  tx_rules: TxRulesSchema,
  api_access: z.record(z.string(), ApiAccessRuleSchema),
  contract_rules: ContractRulesSchema,
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// --- Stored Key ---

const StoredKeySchema = z.object({
  private_key: z.string(),
  address: z.string(),
  chains: z.array(z.number().int()),
});

// --- Stored API Key ---

const StoredApiKeySchema = z.object({
  key: z.string(),
  base_url: z.string().url(),
});

// --- Stored RPC Endpoint ---

const StoredRpcEndpointSchema = z.object({
  url: z.string().url(),
  chain_id: z.number().int(),
});

// --- Master Vault ---

export const MasterVaultDataSchema = z.object({
  version: z.literal(1),
  keys: z.record(z.string(), StoredKeySchema),
  api_keys: z.record(z.string(), StoredApiKeySchema),
  rpc_endpoints: z.record(z.string(), StoredRpcEndpointSchema),
  agents: z.record(z.string(), AgentConfigSchema),
});
export type MasterVaultData = z.infer<typeof MasterVaultDataSchema>;

// --- Agent Vault ---

export const AgentVaultDataSchema = z.object({
  version: z.literal(1),
  agent_name: z.string(),
  config: AgentConfigSchema,
  keys: z.record(z.string(), StoredKeySchema),
  api_keys: z.record(z.string(), StoredApiKeySchema),
  rpc_endpoints: z.record(z.string(), StoredRpcEndpointSchema),
});
export type AgentVaultData = z.infer<typeof AgentVaultDataSchema>;
