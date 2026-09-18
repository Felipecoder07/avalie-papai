import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    setupFiles: ['./tests/setup.mjs'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
