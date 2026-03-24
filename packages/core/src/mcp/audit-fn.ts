/**
 * Lightweight audit function signature passed to tool registration functions.
 * Wraps the underlying AuditStore with the agent name from context.
 *
 * chain_id is optional because some tools (compile_contract, query_price) are
 * not chain-specific.
 */
export type AuditFn = (entry: {
  action: string;
  chain_id?: number;
  status: 'approved' | 'denied';
  details: string;
}) => void;
