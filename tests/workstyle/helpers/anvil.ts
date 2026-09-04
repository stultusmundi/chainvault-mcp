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
  /**
   * Fork endpoints to try in order. A free archive endpoint can answer a single
   * probe and still throttle the burst of requests anvil makes while forking,
   * so one reachable URL is not proof it can carry a run — fall through to the
   * next instead of failing. Takes precedence over `forkUrl`.
   */
  forkUrls?: readonly string[];
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
    const forkUrls = opts.forkUrls ?? (opts.forkUrl ? [opts.forkUrl] : []);
    // Fork mode keeps the origin chain id (e.g. 1) unless overridden.
    const chainId = opts.chainId ?? (forkUrls.length > 0 ? 1 : ANVIL_CHAIN_ID);

    if (forkUrls.length === 0) {
      return AnvilHarness.spawnOne(undefined, chainId, opts.forkBlock, 15_000);
    }

    const failures: string[] = [];
    for (const forkUrl of forkUrls) {
      try {
        return await AnvilHarness.spawnOne(forkUrl, chainId, opts.forkBlock, 120_000);
      } catch (err) {
        failures.push(`${forkUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`no fork endpoint could start anvil —\n  ${failures.join('\n  ')}`);
  }

  private static async spawnOne(
    forkUrl: string | undefined,
    chainId: number,
    forkBlock: number | undefined,
    timeoutMs: number,
  ): Promise<AnvilHarness> {
    const port = await freePort();
    const args = ['--port', String(port), '--silent'];
    if (!forkUrl) args.push('--chain-id', String(chainId));
    if (forkUrl) {
      args.push('--fork-url', forkUrl);
      if (forkBlock) args.push('--fork-block-number', String(forkBlock));
    }
    const proc = spawn('anvil', args, { stdio: 'ignore' });
    const harness = new AnvilHarness(proc, `http://127.0.0.1:${port}`, chainId);
    await harness.waitReady(timeoutMs);
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

  /**
   * Waits until a transaction has a receipt.
   *
   * anvil >= 1.8 mines auto-mined transactions asynchronously: the block is
   * produced on a later tick, so `eth_sendRawTransaction` can return a hash
   * before the transaction is in a block. Any "write, then immediately read"
   * assertion then races the miner and sees pre-write state (anvil <= 1.7.1
   * mined synchronously, which is why these suites were green before).
   * Polling the receipt makes the tests correct on both.
   */
  async waitForTx(hash: string, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await this.rpc<unknown>('eth_getTransactionReceipt', [hash]);
      if (receipt !== null && receipt !== undefined) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`transaction ${hash} was not mined within ${timeoutMs}ms`);
  }

  async stop(): Promise<void> {
    if (this.proc.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => this.proc.once('exit', () => resolve()));
    this.proc.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }
}
