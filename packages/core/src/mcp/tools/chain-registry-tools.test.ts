import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requestFaucetMock } = vi.hoisted(() => ({
  requestFaucetMock: vi.fn(async () => ({
    success: true,
    message: 'Faucet request sent',
    chainId: 11155111,
    chainName: 'Sepolia',
  })),
}));

vi.mock('../../chain/faucet.js', () => ({
  requestFaucet: requestFaucetMock,
  getFaucetInfo: vi.fn(),
}));

import { registerChainRegistryTools } from './chain-registry-tools.js';
import type { AgentContext } from '../context.js';

function createFakeServer() {
  const handlers = new Map<string, (args: any) => Promise<any>>();
  return {
    handlers,
    registerTool: (name: string, _config: unknown, handler: (args: any) => Promise<any>) => {
      handlers.set(name, handler);
    },
  } as any;
}

// Agent with access to chain 11155111 only.
function createContext(): AgentContext {
  return {
    agentName: 'faucet-agent',
    config: {} as AgentContext['config'],
    rules: {
      checkTxRequest: ({ chain_id }: { chain_id: number }) => ({ approved: chain_id === 11155111 }),
      recordSpend: vi.fn(),
    } as unknown as AgentContext['rules'],
    keys: [],
    getPrivateKeyForChain: () => null,
    getApiKey: () => null,
    getApiKeyForExplorer: () => null,
    getRpcUrlForChain: () => null,
  };
}

const VALID_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('request_faucet access control', () => {
  beforeEach(() => {
    requestFaucetMock.mockClear();
  });

  it('denies when there is no agent context', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerChainRegistryTools(server, () => null, audit);
    const res = await server.handlers.get('request_faucet')({ chain_id: 11155111, address: VALID_ADDRESS });
    expect(res.content[0].text).toMatch(/no agent context/i);
    expect(requestFaucetMock).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
  });

  it('denies a chain the agent cannot access', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerChainRegistryTools(server, () => createContext(), audit);
    const res = await server.handlers.get('request_faucet')({ chain_id: 80002, address: VALID_ADDRESS });
    expect(requestFaucetMock).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
  });

  it('denies a malformed recipient address', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerChainRegistryTools(server, () => createContext(), audit);
    for (const bad of ['not-an-address', '0x123', '0xZZZ', VALID_ADDRESS + 'ff']) {
      requestFaucetMock.mockClear();
      const res = await server.handlers.get('request_faucet')({ chain_id: 11155111, address: bad });
      expect(res.content[0].text, `address ${bad}`).toMatch(/invalid.*address/i);
      expect(requestFaucetMock).not.toHaveBeenCalled();
    }
  });

  it('approves a valid request on an accessible chain', async () => {
    const server = createFakeServer();
    const audit = vi.fn();
    registerChainRegistryTools(server, () => createContext(), audit);
    const res = await server.handlers.get('request_faucet')({ chain_id: 11155111, address: VALID_ADDRESS });
    expect(requestFaucetMock).toHaveBeenCalledWith(11155111, VALID_ADDRESS);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(res.content[0].text).toContain('Faucet request sent');
  });
});
