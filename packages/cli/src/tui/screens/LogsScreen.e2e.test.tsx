import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChainVaultDB, AuditStore } from '@chainvault/core';
import { LogsScreen } from './LogsScreen.js';
import { KEYS } from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

function createMockAuditStore(entries: Array<{
  timestamp: string;
  agent: string;
  action: string;
  chain_id: number;
  status: 'approved' | 'denied';
  details: string;
}>): AuditStore {
  return {
    getEntries: vi.fn((filter?: { status?: 'approved' | 'denied' }) => {
      if (!filter) return entries;
      return entries.filter((e) => e.status === filter.status);
    }),
  } as unknown as AuditStore;
}

const SAMPLE_ENTRIES = [
  { timestamp: '2026-03-20T10:00:00.000Z', agent: 'deployer', action: 'deploy', chain_id: 11155111, status: 'approved' as const, details: 'deployed contract' },
  { timestamp: '2026-03-20T10:01:00.000Z', agent: 'reader', action: 'read', chain_id: 1, status: 'approved' as const, details: 'read balance' },
  { timestamp: '2026-03-20T10:02:00.000Z', agent: 'deployer', action: 'transfer', chain_id: 1, status: 'denied' as const, details: 'chain not allowed' },
  { timestamp: '2026-03-20T10:03:00.000Z', agent: 'reader', action: 'write', chain_id: 137, status: 'denied' as const, details: 'tx type not allowed' },
];

describe('LogsScreen e2e', () => {
  // ── Display ──────────────────────────────────────────

  describe('display', () => {
    it('renders audit entries with timestamps, agent names, and actions', () => {
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('2026-03-20T10:00:00');
      expect(frame).toContain('deployer');
      expect(frame).toContain('deploy');
      expect(frame).toContain('reader');
      expect(frame).toContain('read');
    });

    it('shows green indicator for approved entries', () => {
      const store = createMockAuditStore([SAMPLE_ENTRIES[0]]);
      const { lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      // The component renders '+' for approved entries
      expect(frame).toContain('+');
      expect(frame).toContain('deployer');
    });

    it('shows red indicator for denied entries', () => {
      const store = createMockAuditStore([SAMPLE_ENTRIES[2]]);
      const { lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      // The component renders 'x' for denied entries
      expect(frame).toContain('x');
      expect(frame).toContain('deployer');
    });

    it('shows "No log entries" when empty', () => {
      const store = createMockAuditStore([]);
      const { lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('No log entries');
    });

    it('shows page count', () => {
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      // 4 entries, PAGE_SIZE=15, so page 1/1
      expect(frame).toContain('page 1/1');
    });
  });

  // ── Filter cycling ───────────────────────────────────

  describe('filter cycling (f key)', () => {
    it('f cycles: all -> approved -> denied -> all', async () => {
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      // Initial: filter = all
      expect(lastFrame()!).toMatch(/Filter:\s+all/);

      await delay();
      stdin.write('f');
      await delay();
      expect(lastFrame()!).toMatch(/Filter:\s+approved/);

      await delay();
      stdin.write('f');
      await delay();
      expect(lastFrame()!).toMatch(/Filter:\s+denied/);

      await delay();
      stdin.write('f');
      await delay();
      expect(lastFrame()!).toMatch(/Filter:\s+all/);
    });

    it('filter "approved" shows only approved entries', async () => {
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      await delay();
      stdin.write('f');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toMatch(/Filter:\s+approved/);
      // getEntries should have been called with { status: 'approved' }
      expect(store.getEntries).toHaveBeenCalledWith({ status: 'approved' }, 200);
    });

    it('filter "denied" shows only denied entries', async () => {
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      await delay();
      stdin.write('f');
      await delay();
      stdin.write('f');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toMatch(/Filter:\s+denied/);
      expect(store.getEntries).toHaveBeenCalledWith({ status: 'denied' }, 200);
    });
  });

  // ── Scrolling ────────────────────────────────────────

  describe('scrolling', () => {
    it('down arrow scrolls log entries', async () => {
      // Create 20 entries so we can scroll beyond PAGE_SIZE (15)
      const manyEntries = Array.from({ length: 20 }, (_, i) => ({
        timestamp: `2026-03-20T10:${String(i).padStart(2, '0')}:00.000Z`,
        agent: `agent-${i}`,
        action: 'read',
        chain_id: 1,
        status: 'approved' as const,
        details: `entry ${i}`,
      }));
      const store = createMockAuditStore(manyEntries);
      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );
      // Initially we see agent-0
      expect(lastFrame()!).toContain('agent-0');

      await delay();
      // Scroll down enough to push agent-0 out of view
      for (let i = 0; i < 5; i++) {
        stdin.write(KEYS.DOWN);
      }
      await delay();

      const frame = lastFrame()!;
      // After scrolling down 5 times, agent-5 should be visible (first visible)
      expect(frame).toContain('agent-5');
    });

    it('up arrow scrolls back up', async () => {
      const manyEntries = Array.from({ length: 20 }, (_, i) => ({
        timestamp: `2026-03-20T10:${String(i).padStart(2, '0')}:00.000Z`,
        agent: `agent-${i}`,
        action: 'read',
        chain_id: 1,
        status: 'approved' as const,
        details: `entry ${i}`,
      }));
      const store = createMockAuditStore(manyEntries);
      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={store} onBack={vi.fn()} />,
      );

      await delay();
      // Scroll down 5
      for (let i = 0; i < 5; i++) {
        stdin.write(KEYS.DOWN);
      }
      await delay();
      expect(lastFrame()!).toContain('agent-5');

      // Scroll back up 3
      for (let i = 0; i < 3; i++) {
        stdin.write(KEYS.UP);
      }
      await delay();

      const frame = lastFrame()!;
      // After scrolling up 3 from offset 5, we should be at offset 2
      expect(frame).toContain('agent-2');
    });
  });

  // ── Esc calls onBack ────────────────────────────────

  describe('navigation', () => {
    it('Esc calls onBack', async () => {
      const onBack = vi.fn();
      const store = createMockAuditStore(SAMPLE_ENTRIES);
      const { stdin } = render(
        <LogsScreen auditStore={store} onBack={onBack} />,
      );
      await delay();
      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  // ── Real AuditStore roundtrip ────────────────────────

  describe('real AuditStore roundtrip', () => {
    let testDir: string;
    let db: ChainVaultDB;
    let auditStore: AuditStore;

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), 'cv-logs-test-'));
      db = new ChainVaultDB(testDir);
      auditStore = new AuditStore(db);
    });

    afterEach(async () => {
      db.close();
      await rm(testDir, { recursive: true, force: true });
    });

    it('displays entries added via real AuditStore', () => {
      // Add 20 mixed entries
      for (let i = 0; i < 20; i++) {
        auditStore.log({
          agent: `agent-${i}`,
          action: i % 2 === 0 ? 'deploy' : 'read',
          chain_id: i % 2 === 0 ? 11155111 : 1,
          status: i % 3 === 0 ? 'denied' : 'approved',
          details: `entry ${i}`,
        });
      }

      const { lastFrame } = render(
        <LogsScreen auditStore={auditStore} onBack={vi.fn()} />,
      );
      const frame = lastFrame()!;
      // Should display entries (most recent first, getEntries is DESC order)
      expect(frame).toContain('20 entries');
      expect(frame).toContain('Audit Logs');
      // page count: 20 entries / 15 per page = 2 pages
      expect(frame).toContain('page 1/2');
    });

    it('filter to approved only shows correct count', async () => {
      for (let i = 0; i < 20; i++) {
        auditStore.log({
          agent: `agent-${i}`,
          action: 'read',
          chain_id: 1,
          status: i % 3 === 0 ? 'denied' : 'approved',
          details: `entry ${i}`,
        });
      }
      // denied: i=0,3,6,9,12,15,18 => 7 denied, 13 approved

      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={auditStore} onBack={vi.fn()} />,
      );
      // Initial: all 20
      expect(lastFrame()!).toContain('20 entries');

      await delay();
      stdin.write('f');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toMatch(/Filter:\s+approved/);
      expect(frame).toContain('13 entries');
    });

    it('filter to denied only shows correct count', async () => {
      for (let i = 0; i < 20; i++) {
        auditStore.log({
          agent: `agent-${i}`,
          action: 'read',
          chain_id: 1,
          status: i % 3 === 0 ? 'denied' : 'approved',
          details: `entry ${i}`,
        });
      }
      // 7 denied

      const { stdin, lastFrame } = render(
        <LogsScreen auditStore={auditStore} onBack={vi.fn()} />,
      );

      await delay();
      // Press f twice to get to 'denied'
      stdin.write('f');
      await delay();
      stdin.write('f');
      await delay();

      const frame = lastFrame()!;
      expect(frame).toMatch(/Filter:\s+denied/);
      expect(frame).toContain('7 entries');
    });
  });
});
