import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainVaultServer } from '../../../packages/core/src/mcp/server.js';
import { AnvilHarness, type AnvilOptions } from './anvil.js';
import { createVaultFixture, type FixtureAgentSpec, type VaultFixture } from './vault-fixture.js';

export interface WorkstyleMcpOptions {
  agents?: FixtureAgentSpec[];
  agentName?: string;
  anvil?: AnvilOptions;
  chainId?: number;
}

export interface WorkstyleMcp {
  anvil: AnvilHarness;
  fixture: VaultFixture;
  client: Client;
  server: ChainVaultServer;
  close(): Promise<void>;
}

export async function startWorkstyleMcp(opts: WorkstyleMcpOptions = {}): Promise<WorkstyleMcp> {
  const anvil = await AnvilHarness.start(opts.anvil ?? {});
  const fixture = await createVaultFixture({
    rpcUrl: anvil.rpcUrl,
    chainId: opts.chainId ?? anvil.chainId,
    agents: opts.agents,
  });
  const agentName = opts.agentName ?? Object.keys(fixture.vaultKeys)[0];
  return connectMcp(anvil, fixture, agentName);
}

/** Connect (or re-connect, simulating a server restart) an MCP client to a vault fixture. */
export async function connectMcp(
  anvil: AnvilHarness,
  fixture: VaultFixture,
  agentName: string,
): Promise<WorkstyleMcp> {
  const server = new ChainVaultServer({
    basePath: fixture.basePath,
    vaultKey: fixture.vaultKeys[agentName],
  });
  await server.init();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'workstyle-client', version: '1.0.0' });
  await server.getMcpServer().connect(serverTransport);
  await client.connect(clientTransport);

  const handle: WorkstyleMcp = {
    anvil,
    fixture,
    client,
    server,
    close: async () => {
      harnessByClient.delete(handle.client);
      await handle.client.close();
      await handle.server.getMcpServer().close();
      await fixture.cleanup();
      await anvil.stop();
    },
  };
  harnessByClient.set(client, anvil);
  return handle;
}

/**
 * Maps each connected client back to its anvil harness, so callToolJson can
 * wait for a returned transaction to be mined. Tests pass `mcp.client` around
 * rather than the whole handle, so the lookup lives here instead of widening
 * every call site.
 */
const harnessByClient = new WeakMap<Client, AnvilHarness>();

export async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Tool ${name} returned non-JSON: ${text}`);
  }

  // Write tools return as soon as the tx is broadcast — under anvil >= 1.8 the
  // block is mined asynchronously, so a following read would race the miner.
  // Settle here so every write-then-read test is deterministic on any anvil.
  const hash = parsed?.hash ?? parsed?.transactionHash;
  const anvil = harnessByClient.get(client);
  if (anvil && typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
    await anvil.waitForTx(hash);
  }
  return parsed;
}

/** Like callToolJson but returns the raw text (for denial/error messages). */
export async function callToolText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  return (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
