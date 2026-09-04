import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@chainvault/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/core/src/chain/e2e.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'live',
          include: ['packages/core/src/chain/e2e.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'anvil',
          include: ['tests/workstyle/**/*.test.ts'],
          exclude: ['tests/workstyle/fork/**', 'tests/workstyle/testnet/**'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'fork',
          include: ['tests/workstyle/fork/**/*.test.ts'],
          testTimeout: 120_000,
          // Must cover every fork endpoint being tried in turn (see
          // AnvilHarness.start) plus the pre-flight probe, with headroom.
          hookTimeout: 420_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'testnet',
          include: ['tests/workstyle/testnet/**/*.test.ts'],
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
