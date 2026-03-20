import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect } from 'vitest';
import { Dashboard } from './Dashboard.js';
import { KEYS } from '../test-helpers.js';
import type { AuditEntry } from '@chainvault/core';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

const SAMPLE_ACTIVITY: AuditEntry[] = [
  {
    timestamp: '2026-03-20T10:15:30.000Z',
    agent: 'deployer',
    action: 'deploy_contract',
    chain_id: 11155111,
    status: 'approved',
    details: 'deployed to sepolia',
  },
  {
    timestamp: '2026-03-20T10:16:00.000Z',
    agent: 'reader',
    action: 'get_balance',
    chain_id: 1,
    status: 'approved',
    details: 'read balance',
  },
  {
    timestamp: '2026-03-20T10:17:00.000Z',
    agent: 'deployer',
    action: 'transfer',
    chain_id: 1,
    status: 'denied',
    details: 'chain not allowed',
  },
];

describe('Dashboard e2e', () => {
  // ── Display ────────────────────────────────────────────

  describe('display', () => {
    it('displays the vault path', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/home/user/.chainvault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      expect(lastFrame()!).toContain('/home/user/.chainvault');
    });

    it('shows "unlocked" status', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      expect(lastFrame()!).toContain('unlocked');
    });

    it('shows key count, agent count, and RPC count', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={3}
          agentCount={2}
          rpcCount={5}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('3');
      expect(frame).toContain('2');
      expect(frame).toContain('5');
      expect(frame).toContain('Keys');
      expect(frame).toContain('Agents');
      expect(frame).toContain('Endpoints');
    });

    it('shows recent activity entries with timestamp, agent, and action', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={1}
          agentCount={1}
          rpcCount={1}
          recentActivity={SAMPLE_ACTIVITY}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      // Timestamps are sliced to show HH:MM:SS
      expect(frame).toContain('10:15:30');
      expect(frame).toContain('10:16:00');
      expect(frame).toContain('10:17:00');
      expect(frame).toContain('deployer');
      expect(frame).toContain('reader');
      expect(frame).toContain('deploy_contract');
      expect(frame).toContain('get_balance');
      expect(frame).toContain('transfer');
    });

    it('shows + indicator for approved activity', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[SAMPLE_ACTIVITY[0]]}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('+');
      expect(frame).toContain('deployer');
    });

    it('shows x indicator for denied activity', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[SAMPLE_ACTIVITY[2]]}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('x');
      expect(frame).toContain('deployer');
      expect(frame).toContain('transfer');
    });

    it('shows "No activity yet" when recentActivity is empty', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      expect(lastFrame()!).toContain('No activity yet');
    });

    it('shows [R] Register passkey help text', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('[R] Register passkey');
      expect(frame).toContain('Esc back');
    });
  });

  // ── Navigation ─────────────────────────────────────────

  describe('navigation', () => {
    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const { stdin } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={onBack}
        />,
      );
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  // ── Resource counts ────────────────────────────────────

  describe('resource counts', () => {
    it('shows zero counts correctly', () => {
      const { lastFrame } = render(
        <Dashboard
          vaultPath="/tmp/vault"
          keyCount={0}
          agentCount={0}
          rpcCount={0}
          recentActivity={[]}
          onBack={vi.fn()}
        />,
      );
      const frame = lastFrame()!;
      expect(frame).toMatch(/Keys:\s+0/);
      expect(frame).toMatch(/Agents:\s+0/);
      expect(frame).toMatch(/Endpoints:\s+0/);
    });
  });
});
