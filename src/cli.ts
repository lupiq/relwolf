#!/usr/bin/env node
import {RELWOLF_VERSION} from './app-version.js';
import {loadConfig} from './config.js';
import {createProviderFromEnv} from './providers/index.js';
import {run} from './release.js';

async function main(): Promise<void> {
  const cwd = process.cwd();
  const log = (message: string): void => {
    console.log(`[relwolf] ${message}`);
  };

  log(`Version ${RELWOLF_VERSION}`);

  const {config, found} = await loadConfig(cwd);

  if (found) {
    log('Loaded relwolf.yaml.');
  } else {
    log(
      'No relwolf.yaml found, using defaults (single root package, no file updaters).',
    );
  }

  const {provider, currentBranch, defaultBranch} = createProviderFromEnv(
    process.env,
  );

  await run({
    cwd,
    config,
    provider,
    currentBranch,
    defaultBranch,
    releaseAs: process.env.RELWOLF_RELEASE_AS,
    log,
  });
}

main().catch((error: unknown) => {
  console.error(
    `[relwolf] ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
