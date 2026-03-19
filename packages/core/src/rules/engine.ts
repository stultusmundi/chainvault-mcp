import type { AgentConfig } from '../vault/types.js';

export interface TxRequest {
  type: 'deploy' | 'write' | 'transfer' | 'read' | 'simulate';
  chain_id: number;
  value: string; // in native token (e.g., ETH)
  to_address?: string;
}

export interface ApiRequest {
  service: string;
  endpoint: string;
}

export interface RuleResult {
  approved: boolean;
  reason?: string;
}

interface SpendRecord {
  amount: number;
  timestamp: number;
}

export class RulesEngine {
  private config: AgentConfig;
  private spendHistory: Map<number, SpendRecord[]> = new Map(); // chain_id -> records

  constructor(config: AgentConfig) {
    this.config = config;
  }

  checkTxRequest(request: TxRequest): RuleResult {
    // 1. Check chain access
    if (!this.config.chains.includes(request.chain_id)) {
      return { approved: false, reason: `Agent does not have access to chain ${request.chain_id}` };
    }

    // 2. Check tx type
    if (!this.config.tx_rules.allowed_types.includes(request.type)) {
      return { approved: false, reason: `Transaction type '${request.type}' is not allowed` };
    }

    // 3. Check contract rules (if target address provided)
    if (request.to_address) {
      const contractResult = this.checkContractRules(request.to_address);
      if (!contractResult.approved) return contractResult;
    }

    // 4. Check spend limits (skip for read/simulate)
    if (request.type !== 'read' && request.type !== 'simulate') {
      const limitResult = this.checkSpendLimits(request.chain_id, parseFloat(request.value));
      if (!limitResult.approved) return limitResult;
    }

    return { approved: true };
  }

  checkApiRequest(request: ApiRequest): RuleResult {
    const rule = this.config.api_access[request.service];
    if (!rule) {
      return { approved: false, reason: `Agent does not have access to service '${request.service}'` };
    }

    // Check endpoint whitelist
    if (!rule.allowed_endpoints.includes('*') && !rule.allowed_endpoints.includes(request.endpoint)) {
      return { approved: false, reason: `Endpoint '${request.endpoint}' is not in the allowed endpoint list for '${request.service}'` };
    }

    return { approved: true };
  }

  recordSpend(chainId: number, amount: number): void {
    const records = this.spendHistory.get(chainId) || [];
    records.push({ amount, timestamp: Date.now() });
    this.spendHistory.set(chainId, records);
  }

  private checkContractRules(address: string): RuleResult {
    const rules = this.config.contract_rules;
    if (rules.mode === 'none') return { approved: true };

    const normalizedAddress = address.toLowerCase();

    if (rules.mode === 'whitelist') {
      const allowed = rules.addresses.some(
        (a) => a.toLowerCase() === normalizedAddress,
      );
      if (!allowed) {
        return { approved: false, reason: `Address ${address} is not in the contract whitelist` };
      }
    }

    if (rules.mode === 'blacklist') {
      const blocked = rules.addresses.some(
        (a) => a.toLowerCase() === normalizedAddress,
      );
      if (blocked) {
        return { approved: false, reason: `Address ${address} is in the contract blacklist` };
      }
    }

    return { approved: true };
  }

  private checkSpendLimits(chainId: number, value: number): RuleResult {
    const chainKey = chainId.toString();
    const limits = this.config.tx_rules.limits[chainKey];
    if (!limits) return { approved: true }; // no limits configured

    // Per-tx limit
    if (limits.max_per_tx !== 'unlimited') {
      const maxPerTx = parseFloat(limits.max_per_tx);
      if (value > maxPerTx) {
        return { approved: false, reason: `Value ${value} exceeds per-tx limit of ${maxPerTx}` };
      }
    }

    // Daily limit
    if (limits.daily_limit !== 'unlimited') {
      const dailyMax = parseFloat(limits.daily_limit);
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const dailySpent = this.getSpentSince(chainId, dayAgo);
      if (dailySpent + value > dailyMax) {
        return { approved: false, reason: `Would exceed daily limit of ${dailyMax} (spent: ${dailySpent}, requested: ${value})` };
      }
    }

    // Monthly limit
    if (limits.monthly_limit !== 'unlimited') {
      const monthlyMax = parseFloat(limits.monthly_limit);
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const monthlySpent = this.getSpentSince(chainId, monthAgo);
      if (monthlySpent + value > monthlyMax) {
        return { approved: false, reason: `Would exceed monthly limit of ${monthlyMax} (spent: ${monthlySpent}, requested: ${value})` };
      }
    }

    return { approved: true };
  }

  private getSpentSince(chainId: number, since: number): number {
    const records = this.spendHistory.get(chainId) || [];
    return records
      .filter((r) => r.timestamp >= since)
      .reduce((sum, r) => sum + r.amount, 0);
  }
}
