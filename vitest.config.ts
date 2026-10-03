import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests of pure logic (no Firebase, no browser). Rules tests have their own config: vitest.rules.config.ts.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
