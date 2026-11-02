import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {FetchLike} from '../src/providers/http.js';
import type {RunResult} from '../src/release.js';

export const MAIN = 'main';
export const PENDING_LABEL = 'relwolf: pending';

export interface ReleaseRequestInfo {
  title: string;
  body: string;
  state: 'open' | 'merged' | 'closed';
  labels: Array<string>;
  sourceBranch: string;
}

/**
 * A dedicated project on a hosting platform that the scenarios run against. Every scenario gets its own
 * release branch (`e2e-<id>`), so scenarios cannot influence each other; `cleanup()` removes everything they created.
 */
export interface Sandbox {
  /** Makes sure `main` exists (the sandbox may be completely empty) and removes leftovers. */
  init(): Promise<void>;
  cleanup(): Promise<void>;
  newBranchName(): string;
  createBranch(branch: string): Promise<void>;
  /** Commits the given files (created or updated) to `branch`; resolves to the commit sha. */
  commit(
    branch: string,
    message: string,
    files: Record<string, string>,
  ): Promise<string>;
  fileContent(ref: string, filePath: string): Promise<string | null>;
  releaseRequest(id: number): Promise<ReleaseRequestInfo>;
  /** Squash-merges the release request, waiting until the platform has finished checking it. */
  merge(id: number): Promise<void>;
  tagExists(tag: string): Promise<boolean>;
  /** The notes of the release of `tag`, or null if there is no release. */
  releaseBody(tag: string): Promise<string | null>;
  /** Runs relwolf against a fresh full clone of `branch`, like a CI job would. */
  runRelwolf(
    branch: string,
    configYaml?: string,
    releaseAs?: string,
  ): Promise<RunResult>;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export function newBranchName(): string {
  return `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A stalled request must not block a whole scenario; the HTTP client retries idempotent calls. */
export const timeoutFetch: FetchLike = async (input, init) => {
  const started = Date.now();
  const label = `${init?.method ?? 'GET'} ${input}`;

  try {
    const response = await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(60_000),
    });

    if (process.env.E2E_DEBUG) {
      console.log(
        `${label} -> ${response.status} (${Date.now() - started} ms)`,
      );
    }

    return response;
  } catch (error) {
    if (process.env.E2E_DEBUG) {
      console.log(`${label} FAILED`);
    }

    throw error;
  }
};

/** Creates a full clone (with all tags) of a single branch in a temporary directory. */
export function checkoutBranch(options: {
  repositoryUrl: string;
  username: string;
  token: string;
  branch: string;
}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'relwolf-e2e-'));
  const {branch} = options;
  const auth = Buffer.from(`${options.username}:${options.token}`).toString(
    'base64',
  );
  const git = (args: Array<string>, env: NodeJS.ProcessEnv = {}): void => {
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'pipe',
      env: {...process.env, ...env},
    });
  };

  git(['init', '-q', '-b', 'scratch']);
  // The header goes through the environment so that it never shows up in error messages.
  git(
    [
      'fetch',
      '-q',
      '--tags',
      '--force',
      options.repositoryUrl,
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ],
    {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
    },
  );
  git(['checkout', '-q', '-B', branch, `refs/remotes/origin/${branch}`]);

  return dir;
}
