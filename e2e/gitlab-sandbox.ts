import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseConfig} from '../src/config.js';
import {GitLabProvider} from '../src/providers/gitlab.js';
import {HttpClient, type FetchLike} from '../src/providers/http.js';
import {run, type RunResult} from '../src/release.js';

export interface MergeRequestInfo {
  iid: number;
  title: string;
  description: string;
  state: string;
  labels: string[];
  source_branch: string;
}

const MAIN = 'main';
const PENDING_LABEL = 'relwolf: pending';

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * A dedicated GitLab project used as a sandbox. Every scenario gets its own release branch
 * (`e2e-<id>`) so scenarios cannot influence each other; tags, releases and branches are
 * removed again by `cleanup()`.
 */
export class GitLabSandbox {
  private readonly http: HttpClient;
  private readonly project: string;
  private readonly dirs: string[] = [];
  private repositoryUrl = '';

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly projectId: string,
  ) {
    // A stalled request must not block a whole scenario; the client retries idempotent calls.
    const timeoutFetch: FetchLike = async (input, init) => {
      const started = Date.now();

      try {
        const response = await fetch(input, {
          ...init,
          signal: AbortSignal.timeout(60_000),
        });

        if (process.env.E2E_DEBUG) {
          console.log(
            `${init?.method ?? 'GET'} ${input} -> ${response.status} (${Date.now() - started} ms)`,
          );
        }

        return response;
      } catch (error) {
        if (process.env.E2E_DEBUG) {
          console.log(`${init?.method ?? 'GET'} ${input} FAILED`);
        }

        throw error;
      }
    };

    this.http = new HttpClient(
      apiUrl,
      {'PRIVATE-TOKEN': token, 'Accept': 'application/json'},
      timeoutFetch,
    );
    this.project = `/projects/${encodeURIComponent(projectId)}`;
  }

  static fromEnv(env: NodeJS.ProcessEnv): GitLabSandbox {
    const token = env.GITLAB_E2E_TOKEN;
    const projectId = env.GITLAB_E2E_PROJECT_ID;

    if (!token || !projectId) {
      throw new Error(
        'GITLAB_E2E_TOKEN and GITLAB_E2E_PROJECT_ID must be set to run the GitLab E2E tests ' +
          '(locally they can be put into .env.e2e).',
      );
    }

    return new GitLabSandbox(
      env.GITLAB_E2E_API_URL ?? 'https://gitlab.com/api/v4',
      token,
      projectId,
    );
  }

  /** Makes sure `main` exists (the sandbox project may be completely empty) and removes leftovers. */
  async init(): Promise<void> {
    const {data} = await this.http.request('GET', this.project);

    this.repositoryUrl = data.http_url_to_repo as string;

    if (data.empty_repo) {
      await this.http.request(
        'POST',
        `${this.project}/repository/files/${encodeURIComponent('README.md')}`,
        {
          body: {
            branch: MAIN,
            content: '# relwolf E2E sandbox\n',
            commit_message: 'chore: Initialize sandbox',
          },
        },
      );
    }

    await this.cleanup();
  }

  newBranchName(): string {
    return `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  async createBranch(branch: string): Promise<void> {
    await this.http.request('POST', `${this.project}/repository/branches`, {
      body: {branch, ref: MAIN},
    });
  }

  /** Commits the given files (created or updated) to `branch`; resolves to the commit sha. */
  async commit(
    branch: string,
    message: string,
    files: Record<string, string>,
  ): Promise<string> {
    const actions = [];

    for (const [filePath, content] of Object.entries(files)) {
      const exists = await this.http.request(
        'GET',
        `${this.project}/repository/files/${encodeURIComponent(filePath)}`,
        {query: {ref: branch}, allow: [404]},
      );

      actions.push({
        action: exists.status === 404 ? 'create' : 'update',
        file_path: filePath,
        content,
      });
    }

    const {data} = await this.http.request(
      'POST',
      `${this.project}/repository/commits`,
      {body: {branch, commit_message: message, actions}},
    );

    return data.id as string;
  }

  async fileContent(ref: string, filePath: string): Promise<string | null> {
    const response = await this.http.request(
      'GET',
      `${this.project}/repository/files/${encodeURIComponent(filePath)}`,
      {query: {ref}, allow: [404]},
    );

    if (response.status === 404) {
      return null;
    }

    return Buffer.from(response.data.content as string, 'base64').toString(
      'utf8',
    );
  }

  async mergeRequest(iid: number): Promise<MergeRequestInfo> {
    const {data} = await this.http.request(
      'GET',
      `${this.project}/merge_requests/${iid}`,
    );

    return data as MergeRequestInfo;
  }

  /** Squash-merges the merge request, waiting until GitLab has finished checking it. */
  async merge(iid: number): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.http.request(
        'PUT',
        `${this.project}/merge_requests/${iid}/merge`,
        {body: {squash: true}, allow: [405, 406, 409, 422]},
      );

      if (response.status === 200) {
        break;
      }

      if (attempt >= 29) {
        throw new Error(
          `Merge request !${iid} could not be merged: ${JSON.stringify(response.data)}`,
        );
      }

      await sleep(2000);
    }

    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await this.mergeRequest(iid)).state === 'merged') {
        return;
      }

      await sleep(1000);
    }

    throw new Error(`Merge request !${iid} did not reach the merged state.`);
  }

  async tagExists(tag: string): Promise<boolean> {
    const response = await this.http.request(
      'GET',
      `${this.project}/repository/tags/${encodeURIComponent(tag)}`,
      {allow: [404]},
    );

    return response.status !== 404;
  }

  async releaseDescription(tag: string): Promise<string | null> {
    const response = await this.http.request(
      'GET',
      `${this.project}/releases/${encodeURIComponent(tag)}`,
      {allow: [404]},
    );

    return response.status === 404
      ? null
      : ((response.data.description as string | null) ?? '');
  }

  /** Runs relwolf against a fresh full clone of `branch`, like a CI job would. */
  async runRelwolf(
    branch: string,
    configYaml = '',
    releaseAs?: string,
  ): Promise<RunResult> {
    return run({
      cwd: this.checkout(branch),
      config: parseConfig(`branch: ${branch}\n${configYaml}`),
      provider: new GitLabProvider({
        apiUrl: this.apiUrl,
        projectId: this.projectId,
        token: this.token,
      }),
      currentBranch: branch,
      defaultBranch: MAIN,
      releaseAs,
    });
  }

  private checkout(branch: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'relwolf-e2e-'));

    this.dirs.push(dir);
    const auth = Buffer.from(`oauth2:${this.token}`).toString('base64');
    const git = (args: string[], env: NodeJS.ProcessEnv = {}): void => {
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
        this.repositoryUrl,
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

  /** Removes everything the scenarios created: releases, tags, e2e branches and open or pending merge requests. */
  async cleanup(): Promise<void> {
    for (const dir of this.dirs.splice(0)) {
      rmSync(dir, {recursive: true, force: true});
    }

    const releases = await this.http.requestAll(`${this.project}/releases`);

    for (const release of releases as {tag_name: string}[]) {
      await this.http.request(
        'DELETE',
        `${this.project}/releases/${encodeURIComponent(release.tag_name)}`,
        {allow: [404]},
      );
    }

    const tags = await this.http.requestAll(`${this.project}/repository/tags`);

    for (const tag of tags as {name: string}[]) {
      await this.http.request(
        'DELETE',
        `${this.project}/repository/tags/${encodeURIComponent(tag.name)}`,
        {allow: [404]},
      );
    }

    const open = (await this.http.requestAll(`${this.project}/merge_requests`, {
      state: 'opened',
    })) as {iid: number}[];

    for (const request of open) {
      await this.http.request(
        'PUT',
        `${this.project}/merge_requests/${request.iid}`,
        {body: {state_event: 'close'}},
      );
    }

    // Merged requests cannot be deleted; take the pending label off so they are never tagged by a later run.
    const pending = (await this.http.requestAll(
      `${this.project}/merge_requests`,
      {state: 'merged', labels: PENDING_LABEL},
    )) as {iid: number}[];

    for (const request of pending) {
      await this.http.request(
        'PUT',
        `${this.project}/merge_requests/${request.iid}`,
        {body: {remove_labels: PENDING_LABEL}},
      );
    }

    const branches = await this.http.requestAll(
      `${this.project}/repository/branches`,
    );

    for (const branch of branches as {name: string}[]) {
      if (!/^(relwolf\/)?e2e-/.test(branch.name)) {
        continue;
      }

      await this.http.request(
        'DELETE',
        `${this.project}/repository/branches/${encodeURIComponent(branch.name)}`,
        {allow: [404]},
      );
    }
  }
}
