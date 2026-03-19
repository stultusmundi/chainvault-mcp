export interface BalanceResult {
  wei: string;
  formatted: string;
}

export interface ReadContractParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
}

export interface SimulateParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
  account: string;
  value?: string;
}

export interface SimulateResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface EventParams {
  address: string;
  abi: any[];
  eventName: string;
  fromBlock?: bigint;
  toBlock?: bigint;
  args?: Record<string, any>;
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  receipt: {
    status: string;
    gasUsed: string;
  };
}

export interface GasEstimate {
  gasLimit: string;
  gasPriceGwei: string;
  estimatedCostEth: string;
}

export interface EstimateGasParams {
  to: string;
  value: string;
  data?: string;
}

export interface DeployParams {
  abi: any[];
  bytecode: string;
  args?: any[];
  privateKey: string;
}

export interface WriteContractParams {
  address: string;
  abi: any[];
  functionName: string;
  args: any[];
  privateKey: string;
  value?: string;
}

/**
 * Chain-agnostic adapter interface. Implement for each chain family.
 */
export interface ChainAdapter {
  chainId: number;
  getBalance(address: string): Promise<BalanceResult>;
  readContract(params: ReadContractParams): Promise<any>;
  simulateTransaction(params: SimulateParams): Promise<SimulateResult>;
  getEvents(params: EventParams): Promise<any[]>;
  getTransaction(hash: string): Promise<TransactionResult>;
  estimateGas(params: EstimateGasParams): Promise<GasEstimate>;
  deployContract(params: DeployParams): Promise<{ hash: string; address?: string }>;
  writeContract(params: WriteContractParams): Promise<{ hash: string }>;
}
