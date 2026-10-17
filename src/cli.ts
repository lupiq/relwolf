#!/usr/bin/env node
import {loadConfig} from './config.js';
import {createProviderFromEnv} from './providers/index.js';
import {run} from './release.js';

async function main(): Promise<void> {
  const cwd = process.cwd();
  const log = (message: string): void => {
    console.log(`[relwolf] ${message}`);
  };

  const {config, found} = await loadConfig(cwd);
  if (!found)
    log(
      'No relwolf.yaml found, using defaults (single root package, no file updaters).',
    );

  const {provider, currentBranch, defaultBranch} = createProviderFromEnv(
    process.env,
  );
  await run({cwd, config, provider, currentBranch, defaultBranch, log});
}

main().catch((error: unknown) => {
  console.error(
    `[relwolf] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
