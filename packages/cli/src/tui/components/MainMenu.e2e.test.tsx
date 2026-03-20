import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { MainMenu } from './MainMenu.js';
import { KEYS } from '../test-helpers.js';

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

describe('MainMenu e2e', () => {
  it('renders all 6 menu items', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Dashboard');
    expect(frame).toContain('Keys');
    expect(frame).toContain('Agents');
    expect(frame).toContain('Services');
    expect(frame).toContain('Logs');
    expect(frame).toContain('Rules');
  });

  it('shows key and agent counts in header', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={5} agentCount={3} onSelect={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('5 keys');
    expect(frame).toContain('3 agents');
  });

  it('first item (Dashboard) is selected by default with "> " prefix', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('> Dashboard');
  });

  it('down arrow moves selection to next item', async () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    await delay();
    stdin.write(KEYS.DOWN);
    await delay();

    const frame = lastFrame()!;
    expect(frame).toContain('> Keys');
    expect(frame).not.toMatch(/> Dashboard/);
  });

  it('up arrow wraps from top to bottom (Dashboard wraps to Rules)', async () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    // Initially on Dashboard (index 0)
    await delay();
    stdin.write(KEYS.UP);
    await delay();

    const frame = lastFrame()!;
    expect(frame).toContain('> Rules');
  });

  it('down arrow wraps from bottom to top', async () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    await delay();
    // Navigate to the last item (Rules) — 5 down presses
    for (let i = 0; i < 5; i++) {
      stdin.write(KEYS.DOWN);
    }
    await delay();
    expect(lastFrame()!).toContain('> Rules');

    // One more down should wrap to Dashboard
    stdin.write(KEYS.DOWN);
    await delay();
    expect(lastFrame()!).toContain('> Dashboard');
  });

  it('Enter on first item calls onSelect with "dashboard"', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
    );
    await delay();
    stdin.write(KEYS.ENTER);
    await delay();
    expect(onSelect).toHaveBeenCalledWith('dashboard');
  });

  it('navigate to Keys (down arrow) then Enter calls onSelect with "keys"', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
    );
    await delay();
    stdin.write(KEYS.DOWN);
    await delay();
    stdin.write(KEYS.ENTER);
    await delay();
    expect(onSelect).toHaveBeenCalledWith('keys');
  });

  it('navigate to each screen and verify onSelect receives correct value', async () => {
    const screens = ['dashboard', 'keys', 'agents', 'services', 'logs', 'rules'] as const;

    for (let i = 0; i < screens.length; i++) {
      const onSelect = vi.fn();
      const { stdin, unmount } = render(
        <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
      );
      await delay();

      // Navigate down i times from Dashboard to reach target
      for (let j = 0; j < i; j++) {
        stdin.write(KEYS.DOWN);
      }
      await delay();
      stdin.write(KEYS.ENTER);
      await delay();

      expect(onSelect).toHaveBeenCalledWith(screens[i]);
      unmount();
    }
  });

  it('shows navigation help text', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('arrows navigate');
    expect(frame).toContain('Enter select');
  });
});
