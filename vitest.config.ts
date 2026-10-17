import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
    },
  },
});
