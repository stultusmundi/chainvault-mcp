import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RulesScreen } from './RulesScreen.js';
import type { MasterVault } from '@chainvault/core';
import { createTestVault, KEYS, type, waitForRender } from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const SAMPLE_AGENTS = [
  { name: 'deployer', chains: [11155111], allowed_types: ['deploy', 'write', 'read'] },
  { name: 'reader', chains: [1, 137], allowed_types: ['read', 'simulate'] },
];

function mockVault(): MasterVault {
  return {
    isUnlocked: vi.fn(() => true),
    getData: vi.fn(() => ({
      version: 1,
      keys: {},
      api_keys: {},
      rpc_endpoints: {},
      agents: {
        deployer: {
          name: 'deployer',
          chains: [11155111],
          tx_rules: { allowed_types: ['deploy', 'write', 'read'], limits: {} },
          api_access: {},
          contract_rules: { mode: 'none' },
        },
        reader: {
          name: 'reader',
          chains: [1, 137],
          tx_rules: { allowed_types: ['read', 'simulate'], limits: {} },
          api_access: {},
          contract_rules: { mode: 'none' },
        },
      },
    })),
    saveData: vi.fn(async () => {}),
  } as unknown as MasterVault;
}

describe('RulesScreen e2e', () => {
  // ── Agent selection mode ──────────────────────────────

  describe('agent selection mode', () => {
    it('lists agents with names, chains, and tx types', () => {
      const { lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('deployer');
      expect(frame).toContain('11155111');
      expect(frame).toContain('deploy');
      expect(frame).toContain('reader');
      expect(frame).toContain('137');
      expect(frame).toContain('simulate');
    });

    it('arrow navigation highlights different agents', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      // Initially first agent is selected
      expect(lastFrame()!).toMatch(/>\s+deployer/);

      await delay();
      stdin.write(KEYS.DOWN);
      await delay();

      expect(lastFrame()!).toMatch(/>\s+reader/);
    });

    it('Enter selects agent and shows edit menu', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Editing');
      expect(frame).toContain('deployer');
      expect(frame).toContain('Edit Chains');
    });

    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const { stdin } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={onBack}
        />,
      );
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('empty agents list shows appropriate state', () => {
      const { lastFrame } = render(
        <RulesScreen
          agents={[]}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('No agents configured');
    });
  });

  // ── Edit menu ─────────────────────────────────────────

  describe('edit menu', () => {
    it('shows 4 options: Edit Chains, Edit Tx Types, Edit Limits, Back', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Edit Chains');
      expect(frame).toContain('Edit Tx Types');
      expect(frame).toContain('Edit Limits');
      expect(frame).toContain('Back');
    });

    it('navigate with arrows and select Edit Chains with Enter', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // First item is Edit Chains, press Enter
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Chains for');
      expect(frame).toContain('deployer');
    });

    it('navigate to Edit Tx Types with down arrow', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Tx types for');
      expect(frame).toContain('deployer');
    });

    it('"Back" menu item returns to agent selection', async () => {
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Navigate to "Back" (4th item, index 3)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Select agent to edit');
    });
  });

  // ── Edit chains ───────────────────────────────────────

  describe('edit chains', () => {
    it('type valid chain IDs and Enter saves with success message', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Select agent
      stdin.write(KEYS.ENTER);
      await delay();
      // Select Edit Chains
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled input and type new chains
      // The input is pre-filled with current chains "11155111"
      // We need to clear it first, then type new value
      for (let i = 0; i < 10; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, '1,137');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Chains updated');
      expect(mv.saveData).toHaveBeenCalled();
    });

    it('invalid chain IDs show error and vault is unchanged', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear and type invalid chain ID
      for (let i = 0; i < 10; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, 'abc');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Invalid chain ID');
      expect(mv.saveData).not.toHaveBeenCalled();
    });

    it('empty chain input shows error', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear all pre-filled input
      for (let i = 0; i < 10; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('cannot be empty');
    });
  });

  // ── Edit tx types ─────────────────────────────────────

  describe('edit tx types', () => {
    it('type valid types and Enter saves with success message', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Navigate to Edit Tx Types (second item)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled input
      for (let i = 0; i < 20; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, 'deploy,read,simulate');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Tx types updated');
      expect(mv.saveData).toHaveBeenCalled();
    });

    it('invalid type shows error', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled input
      for (let i = 0; i < 20; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, 'hack');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Invalid tx type');
      expect(mv.saveData).not.toHaveBeenCalled();
    });
  });

  // ── Edit limits ───────────────────────────────────────

  describe('edit limits', () => {
    it('type valid limit format and Enter saves', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Navigate to Edit Limits (third item)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      type(stdin, '1:0.5:5.0:50.0');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Limits updated');
      expect(mv.saveData).toHaveBeenCalled();
    });

    it('malformed format shows error', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      type(stdin, 'bad-format');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('Format');
      expect(mv.saveData).not.toHaveBeenCalled();
    });

    it('empty limits input shows error', async () => {
      const mv = mockVault();
      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={SAMPLE_AGENTS}
          masterVault={mv}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Press Enter with empty input
      stdin.write(KEYS.ENTER);
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('cannot be empty');
    });
  });

  // ── Real vault roundtrip ──────────────────────────────

  describe('real vault roundtrip', () => {
    let testDir: string;
    let vault: Awaited<ReturnType<typeof createTestVault>>['vault'];
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createTestVault();
      testDir = result.dir;
      vault = result.vault;
      cleanup = result.cleanup;

      // Add an agent config to the vault
      const data = vault.getData();
      data.agents['test-agent'] = {
        name: 'test-agent',
        chains: [1],
        tx_rules: { allowed_types: ['read'], limits: {} },
        api_access: {},
        contract_rules: { mode: 'none' },
      };
      await vault.saveData();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('edit chains updates vault.getData().agents[name].chains', async () => {
      const agents = [{ name: 'test-agent', chains: [1], allowed_types: ['read'] }];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Select agent
      stdin.write(KEYS.ENTER);
      await delay();
      // Select Edit Chains
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled "1" and type new chains
      stdin.write(KEYS.BACKSPACE);
      await delay();
      type(stdin, '1,137,42161');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Chains updated');

      // Verify vault data was actually updated
      const updatedData = vault.getData();
      expect(updatedData.agents['test-agent'].chains).toEqual([1, 137, 42161]);
    });

    it('edit tx types updates vault.getData().agents[name].tx_rules.allowed_types', async () => {
      const agents = [{ name: 'test-agent', chains: [1], allowed_types: ['read'] }];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Navigate to Edit Tx Types
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled "read" and type new types
      for (let i = 0; i < 5; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, 'deploy,write,read');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Tx types updated');

      const updatedData = vault.getData();
      expect(updatedData.agents['test-agent'].tx_rules.allowed_types).toEqual([
        'deploy',
        'write',
        'read',
      ]);
    });

    it('edit limits updates vault.getData().agents[name].tx_rules.limits', async () => {
      const agents = [{ name: 'test-agent', chains: [1], allowed_types: ['read'] }];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Navigate to Edit Limits
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      type(stdin, '1:0.5:5.0:50.0');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('Limits updated');

      const updatedData = vault.getData();
      expect(updatedData.agents['test-agent'].tx_rules.limits['1']).toEqual({
        max_per_tx: '0.5',
        daily_limit: '5.0',
        monthly_limit: '50.0',
      });
    });

    it('Esc from edit-chains returns to edit menu without saving', async () => {
      const agents = [{ name: 'test-agent', chains: [1], allowed_types: ['read'] }];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      // Type something but Esc before saving
      type(stdin, '999');
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();

      // Should be back in edit menu
      const frame = lastFrame()!;
      expect(frame).toContain('Edit Chains');

      // Vault should still have original chains
      const data = vault.getData();
      expect(data.agents['test-agent'].chains).toEqual([1]);
    });

    it('Esc from edit menu returns to agent selection', async () => {
      const agents = [{ name: 'test-agent', chains: [1], allowed_types: ['read'] }];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Editing');

      stdin.write(KEYS.ESCAPE);
      await delay();

      expect(lastFrame()!).toContain('Select agent to edit');
    });

    it('selecting second agent then editing changes the correct agent', async () => {
      // Add a second agent
      const data = vault.getData();
      data.agents['second-agent'] = {
        name: 'second-agent',
        chains: [137],
        tx_rules: { allowed_types: ['simulate'], limits: {} },
        api_access: {},
        contract_rules: { mode: 'none' },
      };
      await vault.saveData();

      const agents = [
        { name: 'test-agent', chains: [1], allowed_types: ['read'] },
        { name: 'second-agent', chains: [137], allowed_types: ['simulate'] },
      ];

      const { stdin, lastFrame } = render(
        <RulesScreen
          agents={agents}
          masterVault={vault}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Navigate to second agent
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(lastFrame()!).toContain('second-agent');

      // Edit Chains
      stdin.write(KEYS.ENTER);
      await delay();

      // Clear pre-filled "137" and type new chains
      for (let i = 0; i < 5; i++) {
        stdin.write(KEYS.BACKSPACE);
        await waitForRender(20);
      }
      type(stdin, '1,10');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      // Verify second agent was updated, first untouched
      const updatedData = vault.getData();
      expect(updatedData.agents['second-agent'].chains).toEqual([1, 10]);
      expect(updatedData.agents['test-agent'].chains).toEqual([1]);
    });
  });
});
