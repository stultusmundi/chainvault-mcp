import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

export interface AnvilAccount {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

/** First three accounts of anvil's default mnemonic ("test test ... junk"). */
export const ANVIL_ACCOUNTS: AnvilAccount[] = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
];

export const ANVIL_CHAIN_ID = 31337;

export function anvilAvailable(): boolean {
  try {
    execFileSync('anvil', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not allocate port')));
      }
    });
  });
}

export interface AnvilOptions {
  forkUrl?: string;
  forkBlock?: number;
  chainId?: number;
}

export class AnvilHarness {
  private proc: ChildProcess;
  readonly rpcUrl: string;
  readonly chainId: number;

  private constructor(proc: ChildProcess, rpcUrl: string, chainId: number) {
    this.proc = proc;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
  }

  static async start(opts: AnvilOptions = {}): Promise<AnvilHarness> {
    const port = await freePort();
    // Fork mode keeps the origin chain id (e.g. 1) unless overridden.
    const chainId = opts.chainId ?? (opts.forkUrl ? 1 : ANVIL_CHAIN_ID);
    const args = ['--port', String(port), '--silent'];
    if (!opts.forkUrl) args.push('--chain-id', String(chainId));
    if (opts.forkUrl) {
      args.push('--fork-url', opts.forkUrl);
      if (opts.forkBlock) args.push('--fork-block-number', String(opts.forkBlock));
    }
    const proc = spawn('anvil', args, { stdio: 'ignore' });
    const harness = new AnvilHarness(proc, `http://127.0.0.1:${port}`, chainId);
    await harness.waitReady(opts.forkUrl ? 60_000 : 15_000);
    return harness;
  }

  private async waitReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.rpc('eth_chainId');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await this.stop();
    throw new Error(`anvil did not become ready within ${timeoutMs}ms`);
  }

  async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }

  async snapshot(): Promise<string> {
    return this.rpc<string>('evm_snapshot');
  }

  async revert(id: string): Promise<void> {
    await this.rpc('evm_revert', [id]);
  }

  async setBalance(address: string, wei: bigint): Promise<void> {
    await this.rpc('anvil_setBalance', [address, '0x' + wei.toString(16)]);
  }

  async impersonate(address: string): Promise<void> {
    await this.rpc('anvil_impersonateAccount', [address]);
  }

  async stop(): Promise<void> {
    if (this.proc.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => this.proc.once('exit', () => resolve()));
    this.proc.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }
}
