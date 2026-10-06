import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests of pure logic (no Firebase, no browser) and component tests (jsdom + fake-indexeddb, opted in per file
// with a `// @vitest-environment jsdom` comment). Rules tests have their own config: vitest.rules.config.ts.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The app is compiled by Next (jsx: preserve); the tests need the JSX turned into calls.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
