import {existsSync} from 'node:fs';
import {defineConfig} from 'vitest/config';

if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e');

export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // GitLab.com occasionally answers very slowly; every scenario starts from a clean state, so one retry is safe.
    retry: 1,
    // The scenarios share one GitLab project and its tags, so they must run one after another.
    fileParallelism: false,
    sequence: {concurrent: false},
  },
});
