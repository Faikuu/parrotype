import { defineConfig } from 'vitest/config';

// The engine is pure TypeScript, so its tests run in plain Node (no DOM).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
