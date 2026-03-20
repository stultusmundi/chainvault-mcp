import { getChainConfig, type FaucetConfig } from './chains.js';

export interface FaucetResult {
  success: boolean;
  txHash?: string;
  message: string;
  faucetUrl?: string;
  chainId: number;
  chainName: string;
}

/**
 * Attempts to request testnet funds for the given address.
 *
 * For faucets with type 'api': attempts a programmatic request.
 * For faucets with type 'browser' or if API fails: returns the faucet URL.
 */
export async function requestFaucet(
  chainId: number,
  address: string,
): Promise<FaucetResult> {
  const chain = getChainConfig(chainId);
  if (!chain) {
    return {
      success: false,
      message: `Chain ${chainId} is not in the supported chain registry`,
      chainId,
      chainName: `Unknown (${chainId})`,
    };
  }

  if (chain.network !== 'testnet') {
    return {
      success: false,
      message: `${chain.name} is a mainnet — faucets are only available for testnets`,
      chainId,
      chainName: chain.name,
    };
  }

  if (!chain.faucets || chain.faucets.length === 0) {
    return {
      success: false,
      message: `No faucets configured for ${chain.name}`,
      chainId,
      chainName: chain.name,
    };
  }

  // Try API faucets first
  const apiFaucets = chain.faucets.filter((f) => f.type === 'api');
  for (const faucet of apiFaucets) {
    const result = await tryApiFaucet(faucet, address, chain.name, chainId);
    if (result.success) return result;
  }

  // Fall back to browser faucet URLs
  const bestFaucet = chain.faucets[0];
  return {
    success: false,
    message: `Programmatic faucet unavailable. Visit the faucet manually to request ${chain.nativeCurrency.symbol} for ${address}`,
    faucetUrl: bestFaucet.url,
    chainId,
    chainName: chain.name,
  };
}

async function tryApiFaucet(
  faucet: FaucetConfig,
  address: string,
  chainName: string,
  chainId: number,
): Promise<FaucetResult> {
  try {
    const endpoint = faucet.requestEndpoint || faucet.url;
    const response = await fetch(endpoint, {
      method: faucet.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Faucet ${faucet.name} returned ${response.status}`,
        faucetUrl: faucet.url,
        chainId,
        chainName,
      };
    }

    const data = await response.json();
    const txHash = data.txHash || data.hash || data.transactionHash || undefined;

    return {
      success: true,
      txHash,
      message: `Faucet request sent via ${faucet.name}${txHash ? ` — tx: ${txHash}` : ''}`,
      faucetUrl: faucet.url,
      chainId,
      chainName,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Faucet ${faucet.name} failed: ${err.message}`,
      faucetUrl: faucet.url,
      chainId,
      chainName,
    };
  }
}

/**
 * Returns faucet info for a chain without attempting a request.
 */
export function getFaucetInfo(chainId: number): {
  available: boolean;
  faucets: FaucetConfig[];
  chainName: string;
} {
  const chain = getChainConfig(chainId);
  if (!chain) {
    return { available: false, faucets: [], chainName: `Unknown (${chainId})` };
  }
  return {
    available: (chain.faucets?.length ?? 0) > 0,
    faucets: chain.faucets || [],
    chainName: chain.name,
  };
}
