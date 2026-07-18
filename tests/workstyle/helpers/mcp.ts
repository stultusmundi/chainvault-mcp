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

  return {
    anvil, fixture, client, server,
    close: async () => {
      await client.close();
      await server.getMcpServer().close();
      await fixture.cleanup();
      await anvil.stop();
    },
  };
}

export async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Tool ${name} returned non-JSON: ${text}`);
  }
}

/** Like callToolJson but returns the raw text (for denial/error messages). */
export async function callToolText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  return (result.content as Array<{ type: string; text: string }>)
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
