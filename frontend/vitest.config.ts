import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOM-heavy configuration screens need headroom on shared/CI machines.
    testTimeout: 15000,
    fileParallelism: false,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true
  }
});
