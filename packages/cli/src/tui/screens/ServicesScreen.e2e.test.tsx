import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServicesScreen } from './ServicesScreen.js';
import {
  KEYS,
  type,
  createTestVault,
  waitForRender,
} from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const MOCK_API_KEYS = [
  { name: 'etherscan', base_url: 'https://api.etherscan.io' },
  { name: 'polygonscan', base_url: 'https://api.polygonscan.com' },
];

const MOCK_RPC_ENDPOINTS = [
  { name: 'sepolia', url: 'https://rpc.sepolia.org', chain_id: 11155111 },
  { name: 'mainnet', url: 'https://mainnet.infura.io', chain_id: 1 },
];

function defaultProps(overrides: Partial<React.ComponentProps<typeof ServicesScreen>> = {}) {
  return {
    apiKeys: MOCK_API_KEYS,
    rpcEndpoints: MOCK_RPC_ENDPOINTS,
    onAddApiKey: vi.fn().mockResolvedValue(undefined),
    onRemoveApiKey: vi.fn().mockResolvedValue(undefined),
    onAddRpcEndpoint: vi.fn().mockResolvedValue(undefined),
    onRemoveRpcEndpoint: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
    ...overrides,
  };
}

describe('ServicesScreen e2e', () => {
  // ─── List Mode ────────────────────────────────────────────────

  describe('list mode', () => {
    it('renders API keys section with names and URLs', () => {
      const { lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      const frame = lastFrame()!;
      expect(frame).toContain('API Keys');
      expect(frame).toContain('etherscan');
      expect(frame).toContain('https://api.etherscan.io');
      expect(frame).toContain('polygonscan');
      expect(frame).toContain('https://api.polygonscan.com');
    });

    it('renders RPC endpoints section with names and chain IDs', () => {
      const { lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      const frame = lastFrame()!;
      expect(frame).toContain('RPC Endpoints');
      expect(frame).toContain('sepolia');
      expect(frame).toContain('chain 11155111');
      expect(frame).toContain('mainnet');
      expect(frame).toContain('chain 1');
    });

    it('Tab switches active section between API and RPC', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);

      // API section active by default, first API key selected
      expect(lastFrame()!).toMatch(/>\s.*etherscan/);

      await delay();
      stdin.write(KEYS.TAB);
      await delay();

      // Now RPC section active, first RPC endpoint selected
      const frame = lastFrame()!;
      expect(frame).toMatch(/>\s.*sepolia/);
    });

    it('arrow navigation highlights different items in API section', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      // First API key selected by default
      expect(lastFrame()!).toMatch(/>\s.*etherscan/);

      await delay();
      stdin.write(KEYS.DOWN);
      await delay();

      expect(lastFrame()!).toMatch(/>\s.*polygonscan/);
    });

    it('arrow navigation highlights different items in RPC section', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);

      // Switch to RPC section
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      expect(lastFrame()!).toMatch(/>\s.*sepolia/);

      stdin.write(KEYS.DOWN);
      await delay();

      expect(lastFrame()!).toMatch(/>\s.*mainnet/);
    });

    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const { stdin } = render(<ServicesScreen {...defaultProps({ onBack })} />);
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('shows help text', () => {
      const { lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      const frame = lastFrame()!;
      expect(frame).toContain('Tab switch');
      expect(frame).toContain('a add');
      expect(frame).toContain('d delete');
      expect(frame).toContain('Esc back');
    });

    it('shows empty state when no API keys', () => {
      const { lastFrame } = render(
        <ServicesScreen {...defaultProps({ apiKeys: [] })} />,
      );
      expect(lastFrame()!).toContain('No API keys');
    });

    it('shows empty state when no RPC endpoints', () => {
      const { lastFrame } = render(
        <ServicesScreen {...defaultProps({ rpcEndpoints: [] })} />,
      );
      expect(lastFrame()!).toContain('No RPC endpoints');
    });
  });

  // ─── Add API Key Flow ────────────────────────────────────────

  describe('add API key flow', () => {
    it('pressing a enters add-name mode with API key prompt', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('API key');
      expect(frame).toContain('name');
    });

    it('empty name and Enter shows error', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('Name cannot be empty');
    });

    it('valid name proceeds to add-value (API key input)', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('API key value');
    });

    it('API key input is shown as asterisks, not raw text', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'SECRETKEY123');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('************');
      expect(frame).not.toContain('SECRETKEY123');
    });

    it('empty API key and Enter shows error', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Enter without typing API key
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('API key cannot be empty');
    });

    it('valid API key proceeds to add-url (Base URL prompt)', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'MYAPIKEY');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Base URL');
    });

    it('complete API key add flow calls onAddApiKey with correct args', async () => {
      const onAddApiKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <ServicesScreen {...defaultProps({ onAddApiKey })} />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'CG-APIKEY-123');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://api.coingecko.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(200);

      expect(onAddApiKey).toHaveBeenCalledWith(
        'coingecko',
        'CG-APIKEY-123',
        'https://api.coingecko.com',
      );
    });

    it('empty URL and Enter shows error', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'coingecko');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'MYAPIKEY');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Enter without typing URL
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('URL cannot be empty');
    });
  });

  // ─── Add RPC Endpoint Flow ───────────────────────────────────

  describe('add RPC endpoint flow', () => {
    it('Tab to RPC then a enters add-name with RPC endpoint prompt', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('a');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('RPC endpoint');
      expect(frame).toContain('name');
    });

    it('complete RPC add flow: name -> URL -> chain ID -> calls onAddRpcEndpoint', async () => {
      const onAddRpcEndpoint = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <ServicesScreen {...defaultProps({ onAddRpcEndpoint })} />,
      );
      await delay();
      // Switch to RPC section
      stdin.write(KEYS.TAB);
      await delay();
      // Enter add mode
      stdin.write('a');
      await delay();
      // Type name
      type(stdin, 'polygon');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Type URL (RPC skips add-value, goes to add-url)
      type(stdin, 'https://polygon-rpc.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Type chain ID
      type(stdin, '137');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(200);

      expect(onAddRpcEndpoint).toHaveBeenCalledWith(
        'polygon',
        'https://polygon-rpc.com',
        137,
      );
    });

    it('RPC flow shows Chain ID prompt after URL', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'polygon');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://polygon-rpc.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('Chain ID');
    });

    it('invalid chain ID shows error', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'polygon');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://polygon-rpc.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'abc');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('Invalid chain ID');
    });

    it('zero chain ID shows error', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'polygon');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://polygon-rpc.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '0');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('Invalid chain ID');
    });
  });

  // ─── Delete Flows ────────────────────────────────────────────

  describe('delete flows', () => {
    it('API: d shows delete confirmation with API key name', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write('d');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Delete');
      expect(frame).toContain('API key');
      expect(frame).toContain('etherscan');
      expect(frame).toContain('y/n');
    });

    it('API: y confirms deletion and calls onRemoveApiKey', async () => {
      const onRemoveApiKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <ServicesScreen {...defaultProps({ onRemoveApiKey })} />,
      );
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('y');
      await waitForRender(200);

      expect(onRemoveApiKey).toHaveBeenCalledWith('etherscan');
    });

    it('RPC: Tab then d shows delete confirmation with RPC endpoint name', async () => {
      const { stdin, lastFrame } = render(<ServicesScreen {...defaultProps()} />);
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('d');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Delete');
      expect(frame).toContain('RPC endpoint');
      expect(frame).toContain('sepolia');
      expect(frame).toContain('y/n');
    });

    it('RPC: Tab then d then y calls onRemoveRpcEndpoint', async () => {
      const onRemoveRpcEndpoint = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <ServicesScreen {...defaultProps({ onRemoveRpcEndpoint })} />,
      );
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('y');
      await waitForRender(200);

      expect(onRemoveRpcEndpoint).toHaveBeenCalledWith('sepolia');
    });

    it('n cancels deletion and returns to list', async () => {
      const onRemoveApiKey = vi.fn().mockResolvedValue(undefined);
      const { stdin, lastFrame } = render(
        <ServicesScreen {...defaultProps({ onRemoveApiKey })} />,
      );
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('n');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('etherscan');
      expect(frame).toContain('a add');
      expect(onRemoveApiKey).not.toHaveBeenCalled();
    });

    it('d is ignored when current section list is empty', async () => {
      const { stdin, lastFrame } = render(
        <ServicesScreen {...defaultProps({ apiKeys: [] })} />,
      );
      await delay();
      stdin.write('d');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('No API keys');
      expect(frame).not.toContain('Delete');
    });
  });

  // ─── Real Vault Roundtrip ─────────────────────────────────────

  describe('real vault roundtrip', () => {
    let vault: Awaited<ReturnType<typeof createTestVault>>['vault'];
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createTestVault();
      vault = result.vault;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('add API key via real vault callbacks and verify persistence', async () => {
      const onAddApiKey = async (name: string, key: string, url: string) => {
        await vault.addApiKey(name, key, url);
      };

      const { stdin } = render(
        <ServicesScreen
          {...defaultProps({
            apiKeys: [],
            rpcEndpoints: [],
            onAddApiKey,
          })}
        />,
      );

      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'alchemy');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'ALCHEMY_SECRET_KEY');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://eth-mainnet.g.alchemy.com');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(300);

      const storedApiKeys = vault.listApiKeys();
      expect(storedApiKeys).toHaveLength(1);
      expect(storedApiKeys[0].name).toBe('alchemy');
      expect(storedApiKeys[0].base_url).toBe('https://eth-mainnet.g.alchemy.com');
    });

    it('add RPC endpoint via real vault callbacks and verify persistence', async () => {
      const onAddRpcEndpoint = async (name: string, url: string, chainId: number) => {
        await vault.addRpcEndpoint(name, url, chainId);
      };

      const { stdin } = render(
        <ServicesScreen
          {...defaultProps({
            apiKeys: [],
            rpcEndpoints: [],
            onAddRpcEndpoint,
          })}
        />,
      );

      // Switch to RPC section
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'arbitrum');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'https://arb1.arbitrum.io/rpc');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '42161');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(300);

      const storedEndpoints = vault.listRpcEndpoints();
      expect(storedEndpoints).toHaveLength(1);
      expect(storedEndpoints[0].name).toBe('arbitrum');
      expect(storedEndpoints[0].url).toBe('https://arb1.arbitrum.io/rpc');
      expect(storedEndpoints[0].chain_id).toBe(42161);
    });
  });
});
