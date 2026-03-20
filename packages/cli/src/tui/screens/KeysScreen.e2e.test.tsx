import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeysScreen } from './KeysScreen.js';
import type { KeyInfo } from './KeysScreen.js';
import {
  KEYS,
  type,
  createTestVault,
  TEST_PRIVATE_KEY,
  waitForRender,
} from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const MOCK_KEYS: KeyInfo[] = [
  {
    name: 'wallet-1',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chains: [1, 11155111],
  },
  {
    name: 'wallet-2',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    chains: [137],
  },
];

describe('KeysScreen e2e', () => {
  // ─── List Mode ────────────────────────────────────────────────

  describe('list mode', () => {
    it('renders keys with names, addresses, and chains', () => {
      const { lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('wallet-1');
      expect(frame).toContain('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
      expect(frame).toContain('1, 11155111');
      expect(frame).toContain('wallet-2');
      expect(frame).toContain('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(frame).toContain('137');
    });

    it('shows empty state when no keys', () => {
      const { lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('No keys stored');
    });

    it('arrow navigation highlights different keys', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      // First key selected by default
      expect(lastFrame()!).toContain('> ');
      expect(lastFrame()!).toMatch(/>\s.*wallet-1/);

      await delay();
      stdin.write(KEYS.DOWN);
      await delay();

      const frame = lastFrame()!;
      // wallet-2 should now be highlighted
      expect(frame).toMatch(/>\s.*wallet-2/);
    });

    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const { stdin } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={onBack}
        />,
      );
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('shows help text with a add, d delete', () => {
      const { lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('a add');
      expect(frame).toContain('d delete');
      expect(frame).toContain('Esc back');
    });

    it('up arrow does not go past first item', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.UP);
      await delay();
      // Still on first item
      expect(lastFrame()!).toMatch(/>\s.*wallet-1/);
    });
  });

  // ─── Add Flow ─────────────────────────────────────────────────

  describe('add flow', () => {
    it('pressing a enters add-name mode and shows "Key name" prompt', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Key name');
    });

    it('empty name and Enter shows validation error', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Name cannot be empty');
    });

    it('valid name and Enter proceeds to private key prompt', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Private key');
      expect(frame).toContain('my-key');
    });

    it('empty private key and Enter shows error', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Now in add-key mode, press Enter without typing
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Private key cannot be empty');
    });

    it('private key input is shown as asterisks, not raw text', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Type some private key chars
      type(stdin, '0xabc');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('*****');
      expect(frame).not.toContain('0xabc');
    });

    it('valid private key proceeds to chain IDs prompt', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '0xdeadbeef');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Chain IDs');
    });

    it('empty chain IDs and Enter shows error', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '0xdeadbeef');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Now in add-chains mode, press Enter without typing
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Chain IDs cannot be empty');
    });

    it('invalid chain ID shows error', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '0xdeadbeef');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'abc');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Invalid chain ID');
    });

    it('complete add flow calls onAddKey with correct args', async () => {
      const onAddKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <KeysScreen
          keys={[]}
          onAddKey={onAddKey}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Enter add mode
      stdin.write('a');
      await delay();
      // Type name
      type(stdin, 'test-wallet');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Type private key
      type(stdin, '0xdeadbeef1234');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Type chain IDs
      type(stdin, '1,11155111');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(200);

      expect(onAddKey).toHaveBeenCalledWith(
        'test-wallet',
        '0xdeadbeef1234',
        [1, 11155111],
      );
    });

    it('Esc during add-name returns to list without mutation', async () => {
      const onAddKey = vi.fn().mockResolvedValue(undefined);
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={onAddKey}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      expect(lastFrame()!).toContain('Key name');

      stdin.write(KEYS.ESCAPE);
      await delay();

      // Back in list mode
      const frame = lastFrame()!;
      expect(frame).toContain('wallet-1');
      expect(frame).toContain('a add');
      expect(onAddKey).not.toHaveBeenCalled();
    });

    it('backspace removes character in name input', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'abcd');
      await delay();
      expect(lastFrame()!).toContain('abcd');

      stdin.write(KEYS.BACKSPACE);
      await delay();
      const frame = lastFrame()!;
      expect(frame).toContain('abc');
      expect(frame).not.toContain('abcd');
    });

    it('Esc during add-key goes back to add-name', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Now in add-key mode
      expect(lastFrame()!).toContain('Private key');

      stdin.write(KEYS.ESCAPE);
      await delay();

      // Back in add-name mode
      expect(lastFrame()!).toContain('Key name');
    });

    it('Esc during add-chains goes back to add-key', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'my-key');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '0xdeadbeef');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Now in add-chains mode
      expect(lastFrame()!).toContain('Chain IDs');

      stdin.write(KEYS.ESCAPE);
      await delay();

      // Back in add-key mode
      expect(lastFrame()!).toContain('Private key');
    });
  });

  // ─── Delete Flow ──────────────────────────────────────────────

  describe('delete flow', () => {
    it('pressing d shows delete confirmation with key name', async () => {
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Delete');
      expect(frame).toContain('wallet-1');
      expect(frame).toContain('y/n');
    });

    it('y confirms deletion and calls onRemoveKey with key name', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={onRemoveKey}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('y');
      await waitForRender(200);

      expect(onRemoveKey).toHaveBeenCalledWith('wallet-1');
    });

    it('n cancels deletion and returns to list', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={onRemoveKey}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('n');
      await delay();

      // Back in list mode, key still shown
      const frame = lastFrame()!;
      expect(frame).toContain('wallet-1');
      expect(frame).toContain('a add');
      expect(onRemoveKey).not.toHaveBeenCalled();
    });

    it('navigate to second key then delete passes correct name', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={MOCK_KEYS}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={onRemoveKey}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Move to second key
      stdin.write(KEYS.DOWN);
      await delay();
      expect(lastFrame()!).toMatch(/>\s.*wallet-2/);

      stdin.write('d');
      await delay();
      // Confirm shows wallet-2
      expect(lastFrame()!).toContain('wallet-2');

      stdin.write('y');
      await waitForRender(200);

      expect(onRemoveKey).toHaveBeenCalledWith('wallet-2');
    });

    it('d is ignored when keys list is empty', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin, lastFrame } = render(
        <KeysScreen
          keys={[]}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={onRemoveKey}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();

      // Still in list mode showing empty state
      const frame = lastFrame()!;
      expect(frame).toContain('No keys stored');
      expect(frame).not.toContain('Delete');
    });
  });

  // ─── Real Vault Roundtrip ─────────────────────────────────────

  describe('real vault roundtrip', () => {
    let testDir: string;
    let vault: Awaited<ReturnType<typeof createTestVault>>['vault'];
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createTestVault();
      testDir = result.dir;
      vault = result.vault;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('add key via callbacks then verify vault.listKeys() reflects it', async () => {
      // Start with empty keys
      const currentKeys: KeyInfo[] = [];

      const onAddKey = async (name: string, privateKey: string, chains: number[]) => {
        await vault.addKey(name, privateKey, chains);
      };

      const { stdin } = render(
        <KeysScreen
          keys={currentKeys}
          onAddKey={onAddKey}
          onRemoveKey={vi.fn().mockResolvedValue(undefined)}
          onBack={vi.fn()}
        />,
      );

      await delay();
      // Enter add flow
      stdin.write('a');
      await delay();
      type(stdin, 'real-wallet');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, TEST_PRIVATE_KEY);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '1,11155111');
      await delay();
      stdin.write(KEYS.ENTER);
      await waitForRender(300);

      // Verify the vault actually has the key
      const storedKeys = vault.listKeys();
      expect(storedKeys).toHaveLength(1);
      expect(storedKeys[0].name).toBe('real-wallet');
      expect(storedKeys[0].address).toBe(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      );
      expect(storedKeys[0].chains).toEqual([1, 11155111]);
    });

    it('remove key via callbacks then verify vault.listKeys() is empty', async () => {
      // Pre-populate the vault with a key
      await vault.addKey('to-delete', TEST_PRIVATE_KEY, [1]);
      const currentKeys: KeyInfo[] = [
        {
          name: 'to-delete',
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          chains: [1],
        },
      ];

      const onRemoveKey = async (name: string) => {
        await vault.removeKey(name);
      };

      const { stdin } = render(
        <KeysScreen
          keys={currentKeys}
          onAddKey={vi.fn().mockResolvedValue(undefined)}
          onRemoveKey={onRemoveKey}
          onBack={vi.fn()}
        />,
      );

      await delay();
      stdin.write('d');
      await delay();
      stdin.write('y');
      await waitForRender(300);

      // Verify the vault is now empty
      const storedKeys = vault.listKeys();
      expect(storedKeys).toHaveLength(0);
    });
  });
});
