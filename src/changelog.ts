import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './git.js';

export interface CliffInvocation {
  /** Repository working directory. */
  cwd: string;
  /** Optional git-cliff config path (repository-relative). */
  configPath?: string | undefined;
  /** Git revision range, e.g. "v1.0.0..HEAD". Whole history when omitted. */
  range?: string | undefined;
  /** Tag name to assign to the unreleased commits. */
  tag: string;
  /** Regex of the tags that delimit releases. */
  tagPattern: string;
  includePath?: string | undefined;
  excludePaths: string[];
  /** Commits to leave out of the changelog, e.g. reverted ones. */
  skipCommits?: string[] | undefined;
}

function resolveCliffCommand(env: NodeJS.ProcessEnv): {
  command: string;
  prefix: string[];
} {
  if (env.RELWOLF_GIT_CLIFF) {
    return {command: env.RELWOLF_GIT_CLIFF, prefix: []};
  }

  const script = fileURLToPath(import.meta.resolve('git-cliff/cli'));

  return {command: process.execPath, prefix: [script]};
}

function baseArgs(options: CliffInvocation): string[] {
  const args: string[] = [];

  if (options.range) {
    args.push(options.range);
  } else {
    args.push('--unreleased');
  }

  args.push('--tag', options.tag, '--tag-pattern', options.tagPattern);

  if (options.configPath) {
    args.push('--config', options.configPath);
  }

  if (options.includePath) {
    args.push('--include-path', options.includePath);
  }

  for (const exclude of options.excludePaths) {
    args.push('--exclude-path', exclude);
  }

  for (const sha of options.skipCommits ?? []) {
    args.push('--skip-commit', sha);
  }

  return args;
}

async function cliff(
  options: CliffInvocation,
  extra: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const {command, prefix} = resolveCliffCommand(env);

  return run(command, [...prefix, ...baseArgs(options), ...extra], options.cwd);
}

/** Release notes for a single release (without header and footer). */
export async function generateNotes(
  options: CliffInvocation,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return (await cliff(options, ['--strip', 'all'], env)).trim();
}

/** Returns `existing` with the new release entry prepended, following the user's git-cliff config. */
export async function prependToChangelog(
  options: CliffInvocation,
  existing: string,
  env: NodeJS.ProcessEnv = process.env,
  /** Text added below the new entry, for releases without any change. */
  placeholder?: string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'relwolf-'));
  const file = path.join(dir, 'CHANGELOG.md');

  try {
    await writeFile(file, existing);
    await cliff(options, ['--prepend', file], env);

    const result = await readFile(file, 'utf8');

    if (!placeholder || !result.endsWith(existing)) {
      return result;
    }

    const added = result.slice(0, result.length - existing.length).trimEnd();

    return `${added}\n\n${placeholder}\n\n${existing}`.trimEnd() + '\n';
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
