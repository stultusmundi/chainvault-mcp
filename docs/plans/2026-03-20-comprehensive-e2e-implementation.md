# Comprehensive E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 185+ end-to-end tests covering every TUI screen flow, MCP server integration, and Claude SDK agent-driven tool usage.

**Architecture:** TUI tests use `ink-testing-library` to render Ink components and simulate keystrokes against real vault operations in temp directories. MCP tests use `@modelcontextprotocol/sdk` Client with in-process transport. Claude SDK scripts use `@anthropic-ai/claude-code` to drive the MCP server with a real AI agent.

**Tech Stack:** `ink-testing-library`, `vitest`, `@modelcontextprotocol/sdk`, `@anthropic-ai/claude-code`, real vault operations on temp dirs.

**Design Doc:** `docs/plans/2026-03-20-comprehensive-e2e-testing-design.md`

---

## Task 1: Install Dependencies & Test Helpers

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `package.json` (root)
- Create: `packages/cli/src/tui/test-helpers.ts`
- Modify: `vitest.config.ts`

**Step 1: Add ink-testing-library to CLI package**

```bash
cd packages/cli && npm install --save-dev ink-testing-library@4.0.0
```

**Step 2: Add Claude SDK to root**

```bash
npm install --save-dev @anthropic-ai/claude-code
```

**Step 3: Create test helpers for TUI tests**

```typescript
// packages/cli/src/tui/test-helpers.ts
import React from 'react';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterVault, AgentVaultManager, ChainVaultDB, AuditStore } from '@chainvault/core';

// Ink special key escape sequences
export const KEYS = {
  UP: '\x1B[A',
  DOWN: '\x1B[B',
  ENTER: '\r',
  ESCAPE: '\x1B',
  BACKSPACE: '\x7F',
  TAB: '\t',
} as const;

export function type(stdin: { write: (s: string) => void }, text: string) {
  for (const char of text) {
    stdin.write(char);
  }
}

export function press(stdin: { write: (s: string) => void }, key: keyof typeof KEYS) {
  stdin.write(KEYS[key]);
}

const TEST_PASSWORD = 'test-password-123';
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export { TEST_PASSWORD, TEST_PRIVATE_KEY };

export async function createTestVault(): Promise<{
  dir: string;
  vault: MasterVault;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-tui-test-'));
  await MasterVault.init(dir, TEST_PASSWORD);
  const vault = await MasterVault.unlock(dir, TEST_PASSWORD);
  return {
    dir,
    vault,
    cleanup: async () => {
      vault.lock();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function createTestVaultWithData(): Promise<{
  dir: string;
  vault: MasterVault;
  manager: AgentVaultManager;
  cleanup: () => Promise<void>;
}> {
  const { dir, vault, cleanup } = await createTestVault();
  await vault.addKey('test-wallet', TEST_PRIVATE_KEY, [1, 11155111]);
  await vault.addApiKey('etherscan', 'TEST_KEY', 'https://api.etherscan.io');
  await vault.addRpcEndpoint('sepolia', 'https://rpc.sepolia.org', 11155111);
  const manager = new AgentVaultManager(dir, vault);
  return { dir, vault, manager, cleanup };
}

export function createTestAuditStore(dir: string): AuditStore {
  const db = new ChainVaultDB(dir);
  return new AuditStore(db);
}

// Wait for async renders to settle
export async function waitForRender(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
```

**Step 4: Update vitest config to include .tsx test files**

The current vitest config already includes `packages/*/src/**/*.test.ts`. TSX test files need the `.test.tsx` extension to be included. Update the glob:

In `vitest.config.ts`, change:
```typescript
include: ['packages/*/src/**/*.test.ts'],
```
to:
```typescript
include: ['packages/*/src/**/*.test.{ts,tsx}'],
```

Also add the coverage exclude:
```typescript
exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
```

**Step 5: Verify setup**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: add ink-testing-library, claude-code SDK, and TUI test helpers"
```

---

## Task 2: PasswordPrompt E2E Tests

**Files:**
- Create: `packages/cli/src/tui/components/PasswordPrompt.e2e.test.tsx`

**Step 1: Write the tests**

```tsx
// packages/cli/src/tui/components/PasswordPrompt.e2e.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PasswordPrompt } from './PasswordPrompt.js';
import { KEYS, type, press, waitForRender } from '../test-helpers.js';

describe('PasswordPrompt E2E', () => {
  describe('dual-prompt mode (hasPasskey=true)', () => {
    it('renders passkey and password options', () => {
      const { lastFrame } = render(
        <PasswordPrompt onSubmit={vi.fn()} hasPasskey={true} onPasskeyRequest={vi.fn()} />,
      );
      expect(lastFrame()).toContain('[P] Passkey');
      expect(lastFrame()).toContain('[T] Type password');
    });

    it('P key triggers onPasskeyRequest', () => {
      const onPasskey = vi.fn();
      const { stdin } = render(
        <PasswordPrompt onSubmit={vi.fn()} hasPasskey={true} onPasskeyRequest={onPasskey} />,
      );
      stdin.write('P');
      expect(onPasskey).toHaveBeenCalledOnce();
    });

    it('p key (lowercase) also triggers onPasskeyRequest', () => {
      const onPasskey = vi.fn();
      const { stdin } = render(
        <PasswordPrompt onSubmit={vi.fn()} hasPasskey={true} onPasskeyRequest={onPasskey} />,
      );
      stdin.write('p');
      expect(onPasskey).toHaveBeenCalledOnce();
    });

    it('T key switches to password mode', () => {
      const { stdin, lastFrame } = render(
        <PasswordPrompt onSubmit={vi.fn()} hasPasskey={true} onPasskeyRequest={vi.fn()} />,
      );
      stdin.write('T');
      expect(lastFrame()).toContain('Enter master vault password');
      expect(lastFrame()).not.toContain('[P] Passkey');
    });

    it('t key (lowercase) also switches to password mode', () => {
      const { stdin, lastFrame } = render(
        <PasswordPrompt onSubmit={vi.fn()} hasPasskey={true} onPasskeyRequest={vi.fn()} />,
      );
      stdin.write('t');
      expect(lastFrame()).toContain('Enter master vault password');
    });
  });

  describe('password-only mode (hasPasskey=false)', () => {
    it('renders password prompt directly', () => {
      const { lastFrame } = render(<PasswordPrompt onSubmit={vi.fn()} />);
      expect(lastFrame()).toContain('Enter master vault password');
    });

    it('typing renders asterisks', () => {
      const { stdin, lastFrame } = render(<PasswordPrompt onSubmit={vi.fn()} />);
      stdin.write('a');
      stdin.write('b');
      stdin.write('c');
      expect(lastFrame()).toContain('***');
    });

    it('backspace removes last character', () => {
      const { stdin, lastFrame } = render(<PasswordPrompt onSubmit={vi.fn()} />);
      stdin.write('a');
      stdin.write('b');
      stdin.write('c');
      stdin.write(KEYS.BACKSPACE);
      expect(lastFrame()).toContain('**');
      expect(lastFrame()).not.toContain('***');
    });

    it('Enter with empty password shows validation error', () => {
      const onSubmit = vi.fn();
      const { stdin, lastFrame } = render(<PasswordPrompt onSubmit={onSubmit} />);
      stdin.write(KEYS.ENTER);
      expect(lastFrame()).toContain('Password cannot be empty');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Enter with password calls onSubmit', () => {
      const onSubmit = vi.fn();
      const { stdin } = render(<PasswordPrompt onSubmit={onSubmit} />);
      type(stdin, 'mypassword');
      stdin.write(KEYS.ENTER);
      expect(onSubmit).toHaveBeenCalledWith('mypassword');
    });

    it('displays error prop', () => {
      const { lastFrame } = render(
        <PasswordPrompt onSubmit={vi.fn()} error="Wrong password" />,
      );
      expect(lastFrame()).toContain('Wrong password');
    });

    it('typing clears validation error', () => {
      const { stdin, lastFrame } = render(<PasswordPrompt onSubmit={vi.fn()} />);
      stdin.write(KEYS.ENTER); // trigger validation error
      expect(lastFrame()).toContain('Password cannot be empty');
      stdin.write('a');
      expect(lastFrame()).not.toContain('Password cannot be empty');
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run packages/cli/src/tui/components/PasswordPrompt.e2e.test.tsx`
Expected: All 10 tests PASS.

**Step 3: Fix any failures, then commit**

```bash
git add packages/cli/src/tui/components/PasswordPrompt.e2e.test.tsx
git commit -m "test(tui): add PasswordPrompt e2e tests with ink-testing-library"
```

---

## Task 3: MainMenu E2E Tests

**Files:**
- Create: `packages/cli/src/tui/components/MainMenu.e2e.test.tsx`

**Step 1: Write the tests**

```tsx
// packages/cli/src/tui/components/MainMenu.e2e.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { MainMenu } from './MainMenu.js';
import { KEYS } from '../test-helpers.js';

describe('MainMenu E2E', () => {
  it('renders all 6 menu items', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={3} agentCount={2} onSelect={vi.fn()} />,
    );
    expect(lastFrame()).toContain('Dashboard');
    expect(lastFrame()).toContain('Keys');
    expect(lastFrame()).toContain('Agents');
    expect(lastFrame()).toContain('Services');
    expect(lastFrame()).toContain('Logs');
    expect(lastFrame()).toContain('Rules');
  });

  it('shows key and agent counts in header', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={5} agentCount={3} onSelect={vi.fn()} />,
    );
    expect(lastFrame()).toContain('5 keys');
    expect(lastFrame()).toContain('3 agents');
  });

  it('first item is selected by default', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    expect(lastFrame()).toContain('> Dashboard');
  });

  it('down arrow moves selection down', () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    stdin.write(KEYS.DOWN);
    expect(lastFrame()).toContain('> Keys');
  });

  it('up arrow wraps from top to bottom', () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    stdin.write(KEYS.UP);
    expect(lastFrame()).toContain('> Rules');
  });

  it('down arrow wraps from bottom to top', () => {
    const { stdin, lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    for (let i = 0; i < 6; i++) stdin.write(KEYS.DOWN);
    expect(lastFrame()).toContain('> Dashboard');
  });

  it('Enter on Dashboard calls onSelect with dashboard', () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
    );
    stdin.write(KEYS.ENTER);
    expect(onSelect).toHaveBeenCalledWith('dashboard');
  });

  it('navigate to Keys and select', () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
    );
    stdin.write(KEYS.DOWN);
    stdin.write(KEYS.ENTER);
    expect(onSelect).toHaveBeenCalledWith('keys');
  });

  it('navigate to each screen and select', () => {
    const screens = ['dashboard', 'keys', 'agents', 'services', 'logs', 'rules'];
    for (let i = 0; i < screens.length; i++) {
      const onSelect = vi.fn();
      const { stdin } = render(
        <MainMenu keyCount={0} agentCount={0} onSelect={onSelect} />,
      );
      for (let j = 0; j < i; j++) stdin.write(KEYS.DOWN);
      stdin.write(KEYS.ENTER);
      expect(onSelect).toHaveBeenCalledWith(screens[i]);
    }
  });

  it('shows navigation help text', () => {
    const { lastFrame } = render(
      <MainMenu keyCount={0} agentCount={0} onSelect={vi.fn()} />,
    );
    expect(lastFrame()).toContain('arrows navigate');
    expect(lastFrame()).toContain('Enter select');
  });
});
```

**Step 2: Run and commit**

Run: `npx vitest run packages/cli/src/tui/components/MainMenu.e2e.test.tsx`
Commit: `test(tui): add MainMenu e2e tests`

---

## Task 4: KeysScreen E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/KeysScreen.e2e.test.tsx`

**Step 1: Write the tests**

```tsx
// packages/cli/src/tui/screens/KeysScreen.e2e.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { KeysScreen } from './KeysScreen.js';
import { KEYS, type, press, createTestVault, waitForRender, TEST_PRIVATE_KEY } from '../test-helpers.js';

const MOCK_KEYS = [
  { name: 'wallet-1', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', chains: [1, 11155111] },
  { name: 'wallet-2', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', chains: [137] },
];

describe('KeysScreen E2E', () => {
  describe('list mode', () => {
    it('renders all keys with addresses and chains', () => {
      const { lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      expect(lastFrame()).toContain('wallet-1');
      expect(lastFrame()).toContain('0xf39F');
      expect(lastFrame()).toContain('wallet-2');
    });

    it('shows empty state when no keys', () => {
      const { lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Keys');
    });

    it('arrow navigation highlights different keys', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      expect(lastFrame()).toContain('> wallet-1');
      stdin.write(KEYS.DOWN);
      expect(lastFrame()).toContain('> wallet-2');
    });

    it('Esc calls onBack', () => {
      const onBack = vi.fn();
      const { stdin } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={onBack} />,
      );
      stdin.write(KEYS.ESCAPE);
      expect(onBack).toHaveBeenCalledOnce();
    });

    it('shows help text with available actions', () => {
      const { lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      expect(lastFrame()).toContain('a add');
      expect(lastFrame()).toContain('d delete');
    });
  });

  describe('add flow', () => {
    it('a key enters add-name mode', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      expect(lastFrame()).toContain('Key name');
    });

    it('empty name shows validation error', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      stdin.write(KEYS.ENTER);
      expect(lastFrame()).toContain('empty');
    });

    it('valid name proceeds to private key prompt', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      expect(lastFrame()).toContain('Private key');
    });

    it('empty private key shows validation error', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      stdin.write(KEYS.ENTER); // empty key
      expect(lastFrame()).toContain('empty');
    });

    it('private key shown as asterisks', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      type(stdin, '0xabc');
      expect(lastFrame()).toContain('*****');
      expect(lastFrame()).not.toContain('0xabc');
    });

    it('valid key proceeds to chain IDs prompt', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      type(stdin, '0xabc123');
      stdin.write(KEYS.ENTER);
      expect(lastFrame()).toContain('Chain IDs');
    });

    it('invalid chain IDs show error', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      type(stdin, '0xabc');
      stdin.write(KEYS.ENTER);
      type(stdin, 'invalid');
      stdin.write(KEYS.ENTER);
      expect(lastFrame()).toContain('invalid') || expect(lastFrame()).toContain('error');
    });

    it('complete add flow calls onAddKey with correct args', async () => {
      const onAddKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <KeysScreen keys={[]} onAddKey={onAddKey} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ENTER);
      type(stdin, TEST_PRIVATE_KEY);
      stdin.write(KEYS.ENTER);
      type(stdin, '1,11155111');
      stdin.write(KEYS.ENTER);
      await waitForRender();
      expect(onAddKey).toHaveBeenCalledWith('my-key', TEST_PRIVATE_KEY, [1, 11155111]);
    });

    it('Esc during add returns to list without calling onAddKey', () => {
      const onAddKey = vi.fn();
      const { stdin, lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={onAddKey} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'my-key');
      stdin.write(KEYS.ESCAPE);
      expect(onAddKey).not.toHaveBeenCalled();
      expect(lastFrame()).toContain('wallet-1');
    });

    it('backspace in name field removes character', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={[]} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'abc');
      stdin.write(KEYS.BACKSPACE);
      expect(lastFrame()).toContain('ab');
    });
  });

  describe('delete flow', () => {
    it('d key shows delete confirmation', () => {
      const { stdin, lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('d');
      expect(lastFrame()).toContain('Delete');
      expect(lastFrame()).toContain('wallet-1');
      expect(lastFrame()).toContain('y/n');
    });

    it('y confirms deletion and calls onRemoveKey', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={onRemoveKey} onBack={vi.fn()} />,
      );
      stdin.write('d');
      stdin.write('y');
      await waitForRender();
      expect(onRemoveKey).toHaveBeenCalledWith('wallet-1');
    });

    it('n cancels deletion', () => {
      const onRemoveKey = vi.fn();
      const { stdin, lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={onRemoveKey} onBack={vi.fn()} />,
      );
      stdin.write('d');
      stdin.write('n');
      expect(onRemoveKey).not.toHaveBeenCalled();
      expect(lastFrame()).toContain('wallet-1');
    });

    it('Esc cancels deletion', () => {
      const onRemoveKey = vi.fn();
      const { stdin, lastFrame } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={onRemoveKey} onBack={vi.fn()} />,
      );
      stdin.write('d');
      stdin.write(KEYS.ESCAPE);
      expect(onRemoveKey).not.toHaveBeenCalled();
    });

    it('navigate to second key then delete it', async () => {
      const onRemoveKey = vi.fn().mockResolvedValue(undefined);
      const { stdin } = render(
        <KeysScreen keys={MOCK_KEYS} onAddKey={vi.fn()} onRemoveKey={onRemoveKey} onBack={vi.fn()} />,
      );
      stdin.write(KEYS.DOWN); // select wallet-2
      stdin.write('d');
      stdin.write('y');
      await waitForRender();
      expect(onRemoveKey).toHaveBeenCalledWith('wallet-2');
    });
  });

  describe('full roundtrip with real vault', () => {
    let testDir: string;
    let vault: any;
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

    it('adds a key and verifies it persists in vault', async () => {
      const onAddKey = async (name: string, key: string, chains: number[]) => {
        await vault.addKey(name, key, chains);
      };
      const { stdin } = render(
        <KeysScreen keys={vault.listKeys()} onAddKey={onAddKey} onRemoveKey={vi.fn()} onBack={vi.fn()} />,
      );
      stdin.write('a');
      type(stdin, 'e2e-key');
      stdin.write(KEYS.ENTER);
      type(stdin, TEST_PRIVATE_KEY);
      stdin.write(KEYS.ENTER);
      type(stdin, '1');
      stdin.write(KEYS.ENTER);
      await waitForRender(100);
      const keys = vault.listKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe('e2e-key');
    });

    it('removes a key and verifies it is gone from vault', async () => {
      await vault.addKey('to-remove', TEST_PRIVATE_KEY, [1]);
      const onRemoveKey = async (name: string) => {
        await vault.removeKey(name);
      };
      const { stdin } = render(
        <KeysScreen keys={vault.listKeys()} onAddKey={vi.fn()} onRemoveKey={onRemoveKey} onBack={vi.fn()} />,
      );
      stdin.write('d');
      stdin.write('y');
      await waitForRender(100);
      expect(vault.listKeys()).toHaveLength(0);
    });
  });
});
```

**Step 2: Run and fix**

Run: `npx vitest run packages/cli/src/tui/screens/KeysScreen.e2e.test.tsx`
Fix any failures. Do NOT alter test assertions — fix the source or test setup.

**Step 3: Commit**

```bash
git add packages/cli/src/tui/screens/KeysScreen.e2e.test.tsx
git commit -m "test(tui): add KeysScreen e2e tests — add/delete flows with real vault"
```

---

## Task 5: AgentsScreen E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/AgentsScreen.e2e.test.tsx`

Follow the same pattern as KeysScreen. Test the create flow (name → chains → tx types → vault key display → any key to dismiss), revoke flow (d → confirm), and full roundtrip with real `AgentVaultManager`. Verify vault key format matches `cv_agent_[a-f0-9]{64}`. Verify agent config persists in master vault data. ~25 tests.

Key test cases:
- List mode renders agents with chains and types
- `a` enters create-name mode
- Empty name → error
- Valid name → create-chains mode
- Invalid chain IDs → error
- Valid chains → create-types mode
- Invalid tx types (e.g., "hack") → error
- Valid types → creates agent, shows vault key
- Vault key matches `cv_agent_` format
- Any key after vault key display → back to list
- `d` → confirm-revoke → y → agent removed
- `d` → confirm-revoke → n → agent preserved
- Esc during creation → back to list without creating
- Full roundtrip: create agent with real vault → verify `.vault` file exists
- Full roundtrip: revoke agent → verify file removed

**Step 1: Write tests following KeysScreen pattern**
**Step 2: Run and fix**
**Step 3: Commit**

```bash
git commit -m "test(tui): add AgentsScreen e2e tests — create/revoke flows with real vault"
```

---

## Task 6: ServicesScreen E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/ServicesScreen.e2e.test.tsx`

Test both API and RPC sections, Tab switching, and add/delete flows for each. ~25 tests.

Key test cases:
- Renders API keys section with names and URLs
- Renders RPC endpoints section with names and chain IDs
- Tab switches active section (visual indication)
- API add flow: a → name → key (masked) → URL → calls onAddApiKey
- RPC add flow: Tab → a → name → URL → chain ID → calls onAddRpcEndpoint
- API delete: d → confirm y → calls onRemoveApiKey
- RPC delete: Tab → d → confirm y → calls onRemoveRpcEndpoint
- API key value never appears in rendered output (masked)
- Empty name → error in both sections
- Invalid chain ID for RPC → error
- Esc during add → back to list
- Full roundtrip: add API key + RPC with real vault → verify persists

**Step 1-3: Write, run, commit**

```bash
git commit -m "test(tui): add ServicesScreen e2e tests — API/RPC add/delete with Tab switching"
```

---

## Task 7: LogsScreen E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/LogsScreen.e2e.test.tsx`

Test filtering, scrolling, and display. ~20 tests.

Key test cases:
- Renders audit entries with timestamps
- Shows green `+` for approved entries
- Shows red `x` for denied entries
- `f` cycles filter: all → approved → denied → all
- Filtered view shows only matching entries
- Arrow down scrolls the log
- Arrow up scrolls back
- Shows correct page count (entries / 15)
- Empty log shows "No log entries" or similar
- Full roundtrip: create AuditStore → add 20 mixed entries → verify display → filter approved → verify only approved shown → filter denied → verify

**Step 1-3: Write, run, commit**

```bash
git commit -m "test(tui): add LogsScreen e2e tests — filter cycling, scroll, pagination"
```

---

## Task 8: RulesScreen E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/RulesScreen.e2e.test.tsx`

Test agent selection, edit menu navigation, and all three edit flows (chains, types, limits). ~25 tests.

Key test cases:
- Lists agents for selection
- Enter selects agent → shows edit menu
- Edit menu has 4 options (Chains, Types, Limits, Back)
- Navigate edit menu with arrows
- Edit Chains: enter valid chain IDs → updates vault → success message
- Edit Chains: invalid IDs → error, vault unchanged
- Edit Tx Types: valid types → updates vault → success
- Edit Tx Types: invalid type → error
- Edit Limits: valid format `1:0.5:5.0:50.0` → updates vault → success
- Edit Limits: malformed format → error
- Back from edit menu → agent selection
- Esc from agent selection → onBack
- Full roundtrip with real vault: create agent → edit chains to [1,137] → verify in vault.getData() → edit types → verify → edit limits → verify

**Step 1-3: Write, run, commit**

```bash
git commit -m "test(tui): add RulesScreen e2e tests — edit chains/types/limits with real vault"
```

---

## Task 9: Dashboard & App E2E Tests

**Files:**
- Create: `packages/cli/src/tui/screens/Dashboard.e2e.test.tsx`
- Create: `packages/cli/src/tui/App.e2e.test.tsx`

### Dashboard (~10 tests):
- Displays vault path
- Shows key/agent/RPC counts
- Shows "unlocked" status
- Shows recent activity entries
- Esc calls onBack
- Shows help text with [R] Register passkey

### App full journey (~20 tests):
- Renders password prompt when no vault is unlocked
- Wrong password shows error
- Correct password shows main menu
- Navigate to Keys screen → verify renders
- Navigate to each screen → verify renders correctly
- Esc from screen → back to menu
- Add key via Keys screen → verify count updates in menu
- Full journey: unlock → Keys → add key → back → Agents → create agent → back → verify counts

**Step 1-3: Write, run, commit per file**

```bash
git commit -m "test(tui): add Dashboard e2e tests"
git commit -m "test(tui): add App full-journey e2e tests with real vault operations"
```

---

## Task 10: MCP Server Integration Tests

**Files:**
- Create: `packages/core/src/mcp/mcp-integration.e2e.test.ts`

**Step 1: Write the MCP integration tests**

```typescript
// packages/core/src/mcp/mcp-integration.e2e.test.ts
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChainVaultServer } from './server.js';

describe('MCP Server Integration', { timeout: 30_000 }, () => {
  async function createConnectedClient() {
    const server = new ChainVaultServer({ basePath: '/tmp/mcp-test' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.getMcpServer().connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    return { client, server };
  }

  describe('tool discovery', () => {
    it('lists all 19 registered tools', async () => {
      const { client } = await createConnectedClient();
      const { tools } = await client.listTools();
      expect(tools.length).toBe(19);
    });

    it('every tool has a name, description, and inputSchema', async () => {
      const { client } = await createConnectedClient();
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it('includes expected tool names', async () => {
      const { client } = await createConnectedClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('list_supported_chains');
      expect(names).toContain('request_faucet');
      expect(names).toContain('compile_contract');
      expect(names).toContain('deploy_contract');
      expect(names).toContain('get_balance');
    });
  });

  describe('list_supported_chains', () => {
    it('returns all chains with no filter', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({ name: 'list_supported_chains', arguments: {} });
      const chains = JSON.parse((result.content as any)[0].text);
      expect(chains.length).toBeGreaterThanOrEqual(14);
    });

    it('filters by mainnet', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'mainnet' },
      });
      const chains = JSON.parse((result.content as any)[0].text);
      for (const chain of chains) {
        expect(chain.network).toBe('mainnet');
      }
    });

    it('filters by testnet', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'list_supported_chains',
        arguments: { network: 'testnet' },
      });
      const chains = JSON.parse((result.content as any)[0].text);
      expect(chains.length).toBeGreaterThan(0);
      for (const chain of chains) {
        expect(chain.network).toBe('testnet');
      }
    });

    it('each chain has required fields', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({ name: 'list_supported_chains', arguments: {} });
      const chains = JSON.parse((result.content as any)[0].text);
      for (const chain of chains) {
        expect(chain.chainId).toBeDefined();
        expect(chain.name).toBeDefined();
        expect(chain.nativeCurrency).toBeDefined();
        expect(typeof chain.hasWebSocket).toBe('boolean');
        expect(typeof chain.hasFaucet).toBe('boolean');
      }
    });
  });

  describe('request_faucet', () => {
    it('returns result for testnet chain', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 11155111, address: '0x0000000000000000000000000000000000000001' },
      });
      const data = JSON.parse((result.content as any)[0].text);
      expect(data.chainId).toBe(11155111);
      expect(data.chainName).toBe('Sepolia');
    });

    it('rejects mainnet chain', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 1, address: '0x0000000000000000000000000000000000000001' },
      });
      const data = JSON.parse((result.content as any)[0].text);
      expect(data.success).toBe(false);
      expect(data.message).toContain('mainnet');
    });

    it('rejects unknown chain', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'request_faucet',
        arguments: { chain_id: 999999, address: '0x0000000000000000000000000000000000000001' },
      });
      const data = JSON.parse((result.content as any)[0].text);
      expect(data.success).toBe(false);
    });
  });

  describe('stub tools respond without error', () => {
    it('get_balance returns empty response', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { chain_id: 1, address: '0x0000000000000000000000000000000000000001' },
      });
      expect(result.content).toBeDefined();
    });

    it('list_chains returns empty response', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'list_chains',
        arguments: {},
      });
      expect(result.content).toBeDefined();
    });

    it('simulate_transaction returns empty response', async () => {
      const { client } = await createConnectedClient();
      const result = await client.callTool({
        name: 'simulate_transaction',
        arguments: {
          chain_id: 1,
          address: '0x0000000000000000000000000000000000000001',
          abi: '[]',
          function_name: 'test',
        },
      });
      expect(result.content).toBeDefined();
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run packages/core/src/mcp/mcp-integration.e2e.test.ts`
Fix any import/transport issues — the `InMemoryTransport` import path may vary by SDK version.

**Step 3: Commit**

```bash
git add packages/core/src/mcp/mcp-integration.e2e.test.ts
git commit -m "test(mcp): add MCP server integration tests — tool discovery, chain registry, faucet"
```

---

## Task 11: Claude SDK Agent Scripts

**Files:**
- Create: `tests/agent-e2e/compile-token.ts`
- Create: `tests/agent-e2e/chain-discovery.ts`
- Create: `tests/agent-e2e/HelloToken.sol`

**Step 1: Create HelloToken.sol**

```solidity
// tests/agent-e2e/HelloToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HelloToken {
    string public name = "HelloToken";
    string public symbol = "HELLO";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 _supply) {
        totalSupply = _supply * 10 ** decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
```

**Step 2: Create compile-token.ts**

```typescript
// tests/agent-e2e/compile-token.ts
import { query } from '@anthropic-ai/claude-code';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Check prerequisites
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    console.log('SKIP: Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to run this test');
    process.exit(0);
  }

  const source = readFileSync(join(__dirname, 'HelloToken.sol'), 'utf-8');

  console.log('Starting Claude SDK compile-token test...');
  console.log('Sending prompt to compile HelloToken via ChainVault MCP...\n');

  const messages = await query({
    prompt: `You have access to a compile_contract tool. Use it to compile this Solidity contract.
Contract name: HelloToken
Compiler version: 0.8.20

Source code:
\`\`\`solidity
${source}
\`\`\`

Call compile_contract with the source_code, contract_name "HelloToken", and compiler_version "0.8.20". Report the resulting ABI function names and whether bytecode was generated.`,
    options: {
      maxTurns: 5,
      systemPrompt: 'You are a blockchain developer assistant. Use the available MCP tools.',
      allowedTools: ['mcp__chainvault__compile_contract'],
      mcpServers: {
        chainvault: {
          command: 'node',
          args: [join(__dirname, '../../packages/cli/dist/index.js'), 'serve'],
        },
      },
      permissionMode: 'acceptEdits',
    },
  });

  // Analyze results
  let toolUsed = false;
  let responseText = '';

  for (const msg of messages) {
    if (msg.type === 'result') {
      responseText += msg.result || '';
    }
    // Check if compile_contract was invoked
    if (msg.type === 'tool_use' || (msg as any).name === 'mcp__chainvault__compile_contract') {
      toolUsed = true;
    }
  }

  console.log('Response:', responseText.slice(0, 500));
  console.log('\nResults:');
  console.log('  Tool used (compile_contract):', toolUsed);
  console.log('  Response mentions ABI:', responseText.includes('abi') || responseText.includes('ABI'));
  console.log('  Response mentions transfer:', responseText.toLowerCase().includes('transfer'));
  console.log('  Response mentions bytecode:', responseText.toLowerCase().includes('bytecode'));

  if (!toolUsed) {
    console.error('\nFAIL: Claude did not use the compile_contract tool');
    process.exit(1);
  }

  console.log('\nPASS: Claude successfully used compile_contract via MCP');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

**Step 3: Create chain-discovery.ts**

```typescript
// tests/agent-e2e/chain-discovery.ts
import { query } from '@anthropic-ai/claude-code';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    console.log('SKIP: Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to run this test');
    process.exit(0);
  }

  console.log('Starting Claude SDK chain-discovery test...');
  console.log('Asking Claude to discover supported chains and faucets...\n');

  const messages = await query({
    prompt: 'What testnet blockchains are supported? Which ones have faucets? Use the list_supported_chains tool to find out, then summarize.',
    options: {
      maxTurns: 5,
      systemPrompt: 'You are a blockchain assistant. Use the available MCP tools to answer questions.',
      allowedTools: ['mcp__chainvault__list_supported_chains', 'mcp__chainvault__request_faucet'],
      mcpServers: {
        chainvault: {
          command: 'node',
          args: [join(__dirname, '../../packages/cli/dist/index.js'), 'serve'],
        },
      },
      permissionMode: 'acceptEdits',
    },
  });

  let responseText = '';
  let toolUsed = false;

  for (const msg of messages) {
    if (msg.type === 'result') {
      responseText += msg.result || '';
    }
    if ((msg as any).name === 'mcp__chainvault__list_supported_chains') {
      toolUsed = true;
    }
  }

  console.log('Response:', responseText.slice(0, 800));
  console.log('\nResults:');
  console.log('  Tool used (list_supported_chains):', toolUsed);
  console.log('  Mentions Sepolia:', responseText.includes('Sepolia'));
  console.log('  Mentions Arbitrum:', responseText.includes('Arbitrum'));
  console.log('  Mentions faucet:', responseText.toLowerCase().includes('faucet'));

  if (!toolUsed) {
    console.error('\nFAIL: Claude did not use list_supported_chains');
    process.exit(1);
  }

  console.log('\nPASS: Claude discovered chains via MCP');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

**Step 4: Build and test**

```bash
npm run build
npx tsx tests/agent-e2e/chain-discovery.ts
```

**Step 5: Commit**

```bash
git add tests/agent-e2e/
git commit -m "test: add Claude SDK agent e2e scripts — compile token and chain discovery"
```

---

## Task 12: Full Suite Verification

**Step 1: Run all unit + e2e tests**

```bash
npx vitest run
```

Expected: All tests pass (243 existing + ~185 new ≈ 428 total).

**Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Final commit if any fixes needed**

---

## Task Summary

| Task | Scope | Tests | Description |
|------|-------|-------|-------------|
| 1 | Setup | 0 | Dependencies, helpers, vitest config |
| 2 | PasswordPrompt | ~10 | Dual-mode auth, masking, validation |
| 3 | MainMenu | ~10 | Navigation, selection, counts |
| 4 | KeysScreen | ~25 | Add/delete flows, real vault roundtrip |
| 5 | AgentsScreen | ~25 | Create/revoke flows, vault key display |
| 6 | ServicesScreen | ~25 | API/RPC sections, Tab switching |
| 7 | LogsScreen | ~20 | Filter cycling, scroll, pagination |
| 8 | RulesScreen | ~25 | Edit chains/types/limits, real vault |
| 9 | Dashboard + App | ~30 | Status display, full journey |
| 10 | MCP Integration | ~20 | Tool discovery, chain registry, faucet |
| 11 | Claude SDK | 2 scripts | compile-token, chain-discovery |
| 12 | Verification | 0 | Full suite + type check |

**Total: ~190 new tests + 2 agent scripts**
