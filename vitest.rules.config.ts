import { defineConfig } from 'vitest/config';

// Firestore security rules tests. They need the emulator, so run them with `npm run test:rules`
// (firebase emulators:exec starts it and sets FIRESTORE_EMULATOR_HOST).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // One emulator, one database: files must not run at the same time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
