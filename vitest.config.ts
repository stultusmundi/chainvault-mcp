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
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});
