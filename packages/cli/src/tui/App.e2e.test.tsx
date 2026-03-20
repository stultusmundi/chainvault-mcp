import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from './App.js';
import {
  KEYS,
  type,
  createTestVault,
  createTestVaultWithData,
  TEST_PASSWORD,
  TEST_PRIVATE_KEY,
} from './test-helpers.js';
import { MasterVault } from '@chainvault/core';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

describe('App e2e', () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const result = await createTestVault();
    testDir = result.dir;
    // Lock the vault so App starts in locked state
    result.vault.lock();
    cleanup = result.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  // ── Password Prompt ────────────────────────────────────

  describe('password prompt', () => {
    it('renders password prompt when vault is locked', async () => {
      const { lastFrame } = render(<App basePath={testDir} />);
      await delay();
      const frame = lastFrame()!;
      expect(frame).toContain('password');
    });

    it('shows "ChainVault" title on password prompt', async () => {
      const { lastFrame } = render(<App basePath={testDir} />);
      await delay();
      expect(lastFrame()!).toContain('ChainVault');
    });

    it('wrong password shows error message', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await delay();
      type(stdin, 'wrong-password');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);
      expect(lastFrame()!).toContain('Wrong password');
    });

    it('correct password unlocks and shows main menu', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await delay();
      type(stdin, TEST_PASSWORD);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);
      const frame = lastFrame()!;
      expect(frame).toContain('Dashboard');
      expect(frame).toContain('Keys');
      expect(frame).toContain('Agents');
    });
  });

  // ── Main Menu ──────────────────────────────────────────

  describe('main menu', () => {
    async function unlockApp(stdin: { write: (s: string) => void }) {
      await delay();
      type(stdin, TEST_PASSWORD);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);
    }

    it('shows all 6 screen options after unlock', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      const frame = lastFrame()!;
      expect(frame).toContain('Dashboard');
      expect(frame).toContain('Keys');
      expect(frame).toContain('Agents');
      expect(frame).toContain('Services');
      expect(frame).toContain('Logs');
      expect(frame).toContain('Rules');
    });

    it('navigate to Dashboard (Enter on first item) shows "unlocked" and vault path', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Dashboard is the first item, Enter selects it
      stdin.write(KEYS.ENTER);
      await delay(300);
      const frame = lastFrame()!;
      expect(frame).toContain('unlocked');
      expect(frame).toContain(testDir);
    });

    it('navigate to Keys (down + Enter) shows Keys screen', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Move down to Keys (second item)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);
      const frame = lastFrame()!;
      // KeysScreen shows "No keys stored" when empty
      expect(frame).toContain('No keys stored');
    });

    it('Esc from Dashboard returns to main menu', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Go to Dashboard
      stdin.write(KEYS.ENTER);
      await delay(300);
      expect(lastFrame()!).toContain('unlocked');
      // Press Esc to go back
      stdin.write(KEYS.ESCAPE);
      await delay(300);
      const frame = lastFrame()!;
      expect(frame).toContain('Dashboard');
      expect(frame).toContain('Keys');
      expect(frame).toContain('Agents');
    });

    it('Esc from Keys returns to main menu', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Go to Keys
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);
      expect(lastFrame()!).toContain('No keys stored');
      // Press Esc to go back
      stdin.write(KEYS.ESCAPE);
      await delay(300);
      const frame = lastFrame()!;
      expect(frame).toContain('Dashboard');
      expect(frame).toContain('Keys');
    });

    it('navigate to Services shows Services screen', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Move down to Services (4th item: Dashboard, Keys, Agents, Services)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);
      const frame = lastFrame()!;
      // ServicesScreen should show API keys / RPC endpoints sections
      expect(frame).toContain('API');
    });

    it('navigate to Logs shows Logs screen', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await unlockApp(stdin);
      // Move down to Logs (5th item)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);
      const frame = lastFrame()!;
      expect(frame).toContain('Audit Logs');
    });
  });

  // ── Real vault data roundtrip ──────────────────────────

  describe('vault data roundtrip', () => {
    it('Dashboard shows correct key count after adding key via Keys screen', async () => {
      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      // Unlock
      await delay();
      type(stdin, TEST_PASSWORD);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);

      // Navigate to Keys screen (second item)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      // Add a key: press 'a', type name, Enter, type key, Enter, type chains, Enter
      stdin.write('a');
      await delay();
      type(stdin, 'e2e-wallet');
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
      await delay(300);

      // Go back to main menu
      stdin.write(KEYS.ESCAPE);
      await delay(300);

      // Main menu should now show "1 keys"
      const menuFrame = lastFrame()!;
      expect(menuFrame).toContain('1 keys');

      // Navigate to Dashboard (first item)
      stdin.write(KEYS.ENTER);
      await delay(300);

      // Dashboard should show key count of 1
      const dashFrame = lastFrame()!;
      expect(dashFrame).toContain('unlocked');
      expect(dashFrame).toMatch(/Keys:\s+1/);
    });

    it('main menu reflects pre-populated vault data', async () => {
      // Use a vault with pre-populated data
      await cleanup();
      const result = await createTestVaultWithData();
      testDir = result.dir;
      result.vault.lock();
      cleanup = result.cleanup;

      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await delay();
      type(stdin, TEST_PASSWORD);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);

      const frame = lastFrame()!;
      expect(frame).toContain('1 keys');
    });

    it('Dashboard shows RPC endpoint count from pre-populated vault', async () => {
      await cleanup();
      const result = await createTestVaultWithData();
      testDir = result.dir;
      result.vault.lock();
      cleanup = result.cleanup;

      const { stdin, lastFrame } = render(<App basePath={testDir} />);
      await delay();
      type(stdin, TEST_PASSWORD);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);

      // Go to Dashboard
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toMatch(/Keys:\s+1/);
      expect(frame).toMatch(/Endpoints:\s+1/);
    });
  });
});
