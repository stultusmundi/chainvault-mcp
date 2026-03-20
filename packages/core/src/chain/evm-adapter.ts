import { createPublicClient, createWalletClient, http, formatEther, formatGwei, defineChain, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  ChainAdapter,
  BalanceResult,
  ReadContractParams,
  SimulateParams,
  SimulateResult,
  EventParams,
  TransactionResult,
  GasEstimate,
  EstimateGasParams,
  DeployParams,
  WriteContractParams,
} from './types.js';

export class EvmAdapter implements ChainAdapter {
  chainId: number;
  private client: PublicClient;
  private rpcUrl: string;

  constructor(rpcUrl: string, chainId: number) {
    this.chainId = chainId;
    this.rpcUrl = rpcUrl;
    this.client = createPublicClient({
      transport: http(rpcUrl),
    });
  }

  private getChain() {
    return defineChain({
      id: this.chainId,
      name: `Chain ${this.chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [this.rpcUrl] } },
    });
  }

  async getBalance(address: string): Promise<BalanceResult> {
    const balance = await this.client.getBalance({ address: address as `0x${string}` });
    return {
      wei: balance.toString(),
      formatted: formatEther(balance),
    };
  }

  async readContract(params: ReadContractParams): Promise<any> {
    return this.client.readContract({
      address: params.address as `0x${string}`,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    });
  }

  async simulateTransaction(params: SimulateParams): Promise<SimulateResult> {
    try {
      const result = await this.client.simulateContract({
        address: params.address as `0x${string}`,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        account: params.account as `0x${string}`,
      });
      return { success: true, result: result.result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getEvents(params: EventParams): Promise<any[]> {
    return this.client.getContractEvents({
      address: params.address as `0x${string}`,
      abi: params.abi,
      eventName: params.eventName,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      args: params.args,
    });
  }

  async getTransaction(hash: string): Promise<TransactionResult> {
    const tx = await this.client.getTransaction({ hash: hash as `0x${string}` });
    const receipt = await this.client.getTransactionReceipt({ hash: hash as `0x${string}` });
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to ?? null,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber.toString(),
      receipt: {
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
    };
  }

  async estimateGas(params: EstimateGasParams): Promise<GasEstimate> {
    const gasLimit = await this.client.estimateGas({
      to: params.to as `0x${string}`,
      value: BigInt(params.value || '0'),
      data: params.data as `0x${string}` | undefined,
    });
    const gasPrice = await this.client.getGasPrice();
    const estimatedCost = gasLimit * gasPrice;

    return {
      gasLimit: gasLimit.toString(),
      gasPriceGwei: formatGwei(gasPrice),
      estimatedCostEth: formatEther(estimatedCost),
    };
  }

  async deployContract(params: DeployParams): Promise<{ hash: string; address?: string }> {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const chain = this.getChain();
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(this.rpcUrl),
    });

    const hash = await walletClient.deployContract({
      abi: params.abi,
      bytecode: params.bytecode as `0x${string}`,
      args: params.args || [],
      account,
      chain,
    });

    // Wait for receipt to get contract address
    const receipt = await this.client.waitForTransactionReceipt({ hash });

    return {
      hash,
      address: receipt.contractAddress ?? undefined,
    };
  }

  async writeContract(params: WriteContractParams): Promise<{ hash: string }> {
    const account = privateKeyToAccount(params.privateKey as `0x${string}`);
    const chain = this.getChain();
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(this.rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: params.address as `0x${string}`,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      account,
      chain,
      value: params.value ? BigInt(params.value) : undefined,
    });

    return { hash };
  }
}
