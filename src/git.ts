import {execFile} from 'node:child_process';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly stderr: string,
    cause?: unknown,
  ) {
    super(`Command failed: ${command}\n${stderr}`.trim(), {cause});
    this.name = 'CommandError';
  }
}

export async function run(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  try {
    const {stdout} = await execFileAsync(command, args, {
      cwd,
      ...(env ? {env} : {}),
      maxBuffer: 256 * 1024 * 1024,
    });

    return stdout;
  } catch (error) {
    // The git-cliff npm wrapper appends a long stack trace after the real message.
    const stderr =
      ((error as {stderr?: string}).stderr ?? String(error)).split(
        /\nfile:\/\//,
      )[0] ?? '';

    throw new CommandError(`${command} ${args.join(' ')}`, stderr, error);
  }
}

export interface RawCommit {
  sha: string;
  message: string;
}

export interface StatusEntry {
  path: string;
  /** Whether the file is known to git (staged or committed), i.e. not untracked. */
  tracked: boolean;
  deleted: boolean;
}

export class Git {
  constructor(readonly cwd: string) {}

  private git(...args: string[]): Promise<string> {
    return run('git', args, this.cwd);
  }

  async isShallow(): Promise<boolean> {
    return (
      (await this.git('rev-parse', '--is-shallow-repository')).trim() === 'true'
    );
  }

  async head(): Promise<string> {
    return (await this.git('rev-parse', 'HEAD')).trim();
  }

  /** Tracked files matching a glob (relative to the repository root), sorted. */
  async listFiles(pattern: string): Promise<string[]> {
    const out = await this.git('ls-files', '-z', '--', `:(glob)${pattern}`);

    return out.split('\0').filter(Boolean).sort();
  }

  /** Changed, added, deleted and untracked files of the working tree (repository-relative). */
  async status(): Promise<StatusEntry[]> {
    const out = await this.git(
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    );
    const fields = out.split('\0');
    const entries: StatusEntry[] = [];

    for (let index = 0; index < fields.length; index++) {
      const field = fields[index] ?? '';

      if (field === '') {
        continue;
      }

      const state = field.slice(0, 2);
      const entryPath = field.slice(3);

      entries.push({
        path: entryPath,
        tracked: state !== '??',
        deleted: state.includes('D'),
      });

      // A rename or copy lists its origin as an extra field; the origin counts as deleted.
      if (state.includes('R') || state.includes('C')) {
        const origin = fields[++index] ?? '';

        if (state.includes('R')) {
          entries.push({path: origin, tracked: true, deleted: true});
        }
      }
    }

    return entries;
  }

  /** Resets the given files to HEAD and removes the untracked ones. */
  async discard(entries: readonly StatusEntry[]): Promise<void> {
    const tracked = entries
      .filter(entry => entry.tracked)
      .map(entry => entry.path);

    if (tracked.length > 0) {
      await this.git(
        'restore',
        '--source=HEAD',
        '--staged',
        '--worktree',
        '--',
        ...tracked,
      );
    }

    for (const entry of entries.filter(entry => !entry.tracked)) {
      await rm(path.join(this.cwd, entry.path), {force: true});
    }
  }

  async tagsMergedIntoHead(): Promise<string[]> {
    const out = await this.git('tag', '--merged', 'HEAD');

    return out
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  async isAncestorOfHead(sha: string): Promise<boolean> {
    try {
      await this.git('merge-base', '--is-ancestor', sha, 'HEAD');

      return true;
    } catch (error) {
      // Exit code 1 (not an ancestor) and 128 (commit unknown locally) both mean "not part of HEAD".
      if (error instanceof CommandError) {
        return false;
      }

      throw error;
    }
  }

  async hasTag(tag: string): Promise<boolean> {
    try {
      await this.git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);

      return true;
    } catch {
      return false;
    }
  }

  async createLightweightTag(tag: string, sha: string): Promise<void> {
    await this.git('tag', tag, sha);
  }

  /** Commits in `range` (or the whole history) touching `pathspecs`, newest first, merges excluded. */
  async log(
    range: string | undefined,
    pathspecs: string[],
  ): Promise<RawCommit[]> {
    const args = ['log', '--no-merges', '--format=%x1e%H%x1f%B'];

    args.push(range ?? 'HEAD');

    if (pathspecs.length > 0) {
      args.push('--', ...pathspecs);
    }

    const out = await this.git(...args);

    return out
      .split('\x1e')
      .filter(chunk => chunk.trim() !== '')
      .map(chunk => {
        const [sha = '', ...message] = chunk.split('\x1f');

        return {sha: sha.trim(), message: message.join('\x1f')};
      });
  }
}
