import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AgentsScreen } from './AgentsScreen.js';
import type { MasterVault, AgentVaultManager } from '@chainvault/core';
import { createTestVaultWithData, KEYS, type, waitForRender } from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const SAMPLE_AGENTS = [
  { name: 'deployer', chains: [11155111], allowed_types: ['deploy', 'write', 'read'] },
  { name: 'reader', chains: [1, 137], allowed_types: ['read', 'simulate'] },
];

function mockManager(): AgentVaultManager {
  return {
    createAgent: vi.fn(async () => ({ vaultKey: 'cv_agent_' + 'ab'.repeat(32) })),
    revokeAgent: vi.fn(async () => {}),
    listAgents: vi.fn(() => SAMPLE_AGENTS),
  } as unknown as AgentVaultManager;
}

function mockVault(): MasterVault {
  return {
    isUnlocked: vi.fn(() => true),
    getData: vi.fn(() => ({ agents: {} })),
    saveData: vi.fn(async () => {}),
  } as unknown as MasterVault;
}

describe('AgentsScreen e2e', () => {
  // ── List mode ──────────────────────────────────────

  describe('list mode', () => {
    it('renders agents with names, chains, and tx types', () => {
      const { lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
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

    it('shows empty state when no agents', () => {
      const { lastFrame } = render(
        <AgentsScreen
          agents={[]}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('No agents configured');
    });

    it('arrow navigation highlights different agents', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      // Initially first agent is selected
      expect(lastFrame()!).toContain('> ');
      expect(lastFrame()!).toMatch(/>\s+deployer/);

      await delay();
      stdin.write(KEYS.DOWN);
      await delay();

      const frame = lastFrame()!;
      // reader should now have the selection indicator
      expect(frame).toMatch(/>\s+reader/);
    });

    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const { stdin } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={onBack}
        />,
      );
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('shows help text with a add, d revoke', () => {
      const { lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('a add');
      expect(frame).toContain('d revoke');
    });
  });

  // ── Create flow ────────────────────────────────────

  describe('create flow', () => {
    it('"a" enters create-name mode', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      expect(lastFrame()!).toContain('Agent name');
    });

    it('empty name shows validation error', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Name cannot be empty');
    });

    it('valid name advances to create-chains mode', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'test-agent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Chain IDs');
    });

    it('invalid chain IDs show error', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Enter create-name mode
      stdin.write('a');
      await delay();
      type(stdin, 'myagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      // Now in create-chains mode, type invalid chain
      type(stdin, 'abc');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Invalid chain ID');
    });

    it('valid chains advance to create-types mode', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'myagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '11155111');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Tx types');
    });

    it('invalid tx types show error', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'myagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '1');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'hack');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Invalid tx type');
    });

    it('valid types creates agent and shows vault key', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'newagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '11155111');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'deploy,read');
      await delay();
      stdin.write(KEYS.ENTER);
      // Wait longer for async createAgent to resolve
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toContain('cv_agent_');
      expect(frame).toContain('Save this vault key');
      expect(mgr.createAgent).toHaveBeenCalledTimes(1);
    });

    it('vault key matches cv_agent_ format', async () => {
      const mgr = mockManager();
      (mgr.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
        vaultKey: 'cv_agent_' + 'cd'.repeat(32),
      });

      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'testagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '1');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'read');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      const frame = lastFrame()!;
      expect(frame).toMatch(/cv_agent_[a-f0-9]{64}/);
    });

    it('any key after vault key display returns to list', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Navigate through full create flow
      stdin.write('a');
      await delay();
      type(stdin, 'myagent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '1');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'read');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(300);

      // Should be on show-key screen
      expect(lastFrame()!).toContain('cv_agent_');

      // Press any key to go back to list
      stdin.write(' ');
      await delay();

      const frame = lastFrame()!;
      // Should be back in list mode -- shows the help text
      expect(frame).toContain('a add');
      expect(frame).toContain('d revoke');
    });

    it('Esc during create-name returns to list without creating', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      expect(lastFrame()!).toContain('Agent name');

      stdin.write(KEYS.ESCAPE);
      await delay();

      // Back to list
      expect(lastFrame()!).toContain('a add');
      expect(mgr.createAgent).not.toHaveBeenCalled();
    });

    it('Esc during create-chains goes back to create-name', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'test');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Chain IDs');

      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(lastFrame()!).toContain('Agent name');
    });

    it('Esc during create-types goes back to create-chains', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('a');
      await delay();
      type(stdin, 'test');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '1');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      expect(lastFrame()!).toContain('Tx types');

      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(lastFrame()!).toContain('Chain IDs');
    });
  });

  // ── Revoke flow ────────────────────────────────────

  describe('revoke flow', () => {
    it('"d" shows revoke confirmation', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mockManager()}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      const frame = lastFrame()!;
      expect(frame).toContain('Revoke agent');
      expect(frame).toContain('deployer');
      expect(frame).toContain('y/n');
    });

    it('"y" calls revokeAgent', async () => {
      const mgr = mockManager();
      const { stdin } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      stdin.write('y');
      await delay(300);
      expect(mgr.revokeAgent).toHaveBeenCalledWith('deployer');
    });

    it('"n" cancels revoke and returns to list', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      expect(lastFrame()!).toContain('Revoke agent');

      stdin.write('n');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toContain('a add');
      expect(frame).toContain('d revoke');
      expect(mgr.revokeAgent).not.toHaveBeenCalled();
    });

    it('Esc cancels revoke and returns to list', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      expect(lastFrame()!).toContain('Revoke agent');

      stdin.write(KEYS.ESCAPE);
      await delay();

      expect(lastFrame()!).toContain('a add');
      expect(mgr.revokeAgent).not.toHaveBeenCalled();
    });

    it('revoke targets the selected agent after navigation', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={SAMPLE_AGENTS}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Navigate to second agent (reader)
      stdin.write(KEYS.DOWN);
      await delay();
      stdin.write('d');
      await delay();

      expect(lastFrame()!).toContain('reader');
      expect(lastFrame()!).toContain('y/n');

      stdin.write('y');
      await delay(300);
      expect(mgr.revokeAgent).toHaveBeenCalledWith('reader');
    });

    it('"d" does nothing when there are no agents', async () => {
      const mgr = mockManager();
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={[]}
          masterVault={mockVault()}
          agentManager={mgr}
          onBack={vi.fn()}
        />,
      );
      await delay();
      stdin.write('d');
      await delay();
      // Should still show the list mode with empty state, not confirm-revoke
      expect(lastFrame()!).toContain('No agents configured');
      expect(lastFrame()!).not.toContain('y/n');
    });
  });

  // ── Real vault roundtrip ───────────────────────────

  describe('real vault roundtrip', () => {
    let testDir: string;
    let vault: MasterVault;
    let manager: AgentVaultManager;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createTestVaultWithData();
      testDir = result.dir;
      vault = result.vault;
      manager = result.manager;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('creates agent with real AgentVaultManager and vault file exists on disk', async () => {
      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={[]}
          masterVault={vault}
          agentManager={manager}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Start create flow
      stdin.write('a');
      await delay();
      type(stdin, 'real-agent');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, '11155111');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();
      type(stdin, 'deploy,read');
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(500);

      // Should show vault key
      const frame = lastFrame()!;
      expect(frame).toContain('cv_agent_');
      expect(frame).toMatch(/cv_agent_[a-f0-9]{64}/);

      // Vault file should exist on disk
      const vaultPath = join(testDir, 'agents', 'real-agent.vault');
      expect(existsSync(vaultPath)).toBe(true);
    });

    it('revokes agent with real AgentVaultManager and vault file is removed', async () => {
      // First create an agent directly so we have one to revoke
      const agentConfig = {
        name: 'to-revoke',
        chains: [11155111],
        tx_rules: { allowed_types: ['read' as const], limits: {} },
        api_access: {},
        contract_rules: { mode: 'none' as const },
      };
      await manager.createAgent(agentConfig, [], []);
      const vaultPath = join(testDir, 'agents', 'to-revoke.vault');
      expect(existsSync(vaultPath)).toBe(true);

      const agentsList = [
        { name: 'to-revoke', chains: [11155111], allowed_types: ['read'] },
      ];

      const { stdin, lastFrame } = render(
        <AgentsScreen
          agents={agentsList}
          masterVault={vault}
          agentManager={manager}
          onBack={vi.fn()}
        />,
      );
      await delay();
      // Revoke the agent
      stdin.write('d');
      await delay();
      expect(lastFrame()!).toContain('to-revoke');
      expect(lastFrame()!).toContain('y/n');

      stdin.write('y');
      await delay(500);

      // Vault file should be removed
      expect(existsSync(vaultPath)).toBe(false);
    });
  });
});
