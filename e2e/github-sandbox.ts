import {rmSync} from 'node:fs';
import {parseConfig} from '../src/config.js';
import {GitHubProvider} from '../src/providers/github.js';
import {HttpClient} from '../src/providers/http.js';
import {run, type RunResult} from '../src/release.js';
import {
  checkoutBranch,
  MAIN,
  newBranchName,
  PENDING_LABEL,
  type ReleaseRequestInfo,
  type Sandbox,
  sleep,
  timeoutFetch,
} from './sandbox.js';

const encodeRef = (ref: string): string =>
  ref.split('/').map(encodeURIComponent).join('/');

/** A dedicated GitHub repository used as a sandbox. */
export class GitHubSandbox implements Sandbox {
  private readonly http: HttpClient;
  private readonly repo: string;
  private readonly dirs: Array<string> = [];
  private repositoryUrl = '';

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly repository: string,
  ) {
    const [owner, name] = repository.split('/');

    this.repo = `/repos/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}`;
    this.http = new HttpClient(
      apiUrl,
      {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeoutFetch,
    );
  }

  static fromEnv(env: NodeJS.ProcessEnv): GitHubSandbox {
    const token = env.GH_E2E_TOKEN;
    const repository = env.GH_E2E_REPOSITORY;

    if (!token || !repository?.includes('/')) {
      throw new Error(
        'GH_E2E_TOKEN and GH_E2E_REPOSITORY ("owner/name") must be set to run the GitHub E2E tests ' +
          '(locally they can be put into .env.e2e).',
      );
    }

    return new GitHubSandbox(
      env.GH_E2E_API_URL ?? 'https://api.github.com',
      token,
      repository,
    );
  }

  async init(): Promise<void> {
    const {data} = await this.http.request('GET', this.repo);

    this.repositoryUrl = data.clone_url as string;

    // An empty repository answers 404 or 409 for refs.
    const main = await this.http.request(
      'GET',
      `${this.repo}/git/ref/heads/${MAIN}`,
      {allow: [404, 409]},
    );

    if (main.status !== 200) {
      // The contents API is the only way to create the first commit of an empty repository.
      await this.http.request('PUT', `${this.repo}/contents/README.md`, {
        body: {
          message: 'chore: Initialize sandbox',
          content: Buffer.from('# relwolf E2E sandbox\n').toString('base64'),
          branch: MAIN,
        },
      });
    }

    await this.cleanup();
  }

  newBranchName(): string {
    return newBranchName();
  }

  async createBranch(branch: string): Promise<void> {
    await this.http.request('POST', `${this.repo}/git/refs`, {
      body: {ref: `refs/heads/${branch}`, sha: await this.headSha(MAIN)},
    });
  }

  async commit(
    branch: string,
    message: string,
    files: Record<string, string>,
  ): Promise<string> {
    const parent = await this.headSha(branch);
    const {data: parentCommit} = await this.http.request(
      'GET',
      `${this.repo}/git/commits/${parent}`,
    );
    const {data: tree} = await this.http.request(
      'POST',
      `${this.repo}/git/trees`,
      {
        body: {
          base_tree: parentCommit.tree.sha,
          tree: Object.entries(files).map(([filePath, content]) => ({
            path: filePath,
            mode: '100644',
            type: 'blob',
            content,
          })),
        },
      },
    );
    const {data: commit} = await this.http.request(
      'POST',
      `${this.repo}/git/commits`,
      {body: {message, tree: tree.sha, parents: [parent]}},
    );

    await this.http.request(
      'PATCH',
      `${this.repo}/git/refs/heads/${encodeRef(branch)}`,
      {body: {sha: commit.sha}},
    );

    return commit.sha as string;
  }

  async fileContent(ref: string, filePath: string): Promise<string | null> {
    const response = await this.http.request(
      'GET',
      `${this.repo}/contents/${encodeRef(filePath)}`,
      {query: {ref}, allow: [404]},
    );

    if (response.status === 404) {
      return null;
    }

    return Buffer.from(response.data.content as string, 'base64').toString(
      'utf8',
    );
  }

  async releaseRequest(number: number): Promise<ReleaseRequestInfo> {
    const {data} = await this.http.request(
      'GET',
      `${this.repo}/pulls/${number}`,
    );

    return {
      title: data.title as string,
      body: (data.body as string | null) ?? '',
      state: data.merged_at
        ? 'merged'
        : data.state === 'open'
          ? 'open'
          : 'closed',
      labels: (data.labels as Array<{name: string}>).map(label => label.name),
      sourceBranch: data.head.ref as string,
    };
  }

  async merge(number: number): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.http.request(
        'PUT',
        `${this.repo}/pulls/${number}/merge`,
        {body: {merge_method: 'squash'}, allow: [405, 409, 422]},
      );

      if (response.status === 200) {
        break;
      }

      // GitHub computes mergeability lazily and answers 405 until it is done.
      if (attempt >= 29) {
        throw new Error(
          `Pull request #${number} could not be merged: ${JSON.stringify(response.data)}`,
        );
      }

      await sleep(2000);
    }

    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await this.releaseRequest(number)).state === 'merged') {
        return;
      }

      await sleep(1000);
    }

    throw new Error(`Pull request #${number} did not reach the merged state.`);
  }

  async tagExists(tag: string): Promise<boolean> {
    const response = await this.http.request(
      'GET',
      `${this.repo}/git/ref/tags/${encodeRef(tag)}`,
      {allow: [404]},
    );

    return response.status !== 404;
  }

  async createTag(tag: string, sha: string): Promise<void> {
    const {data} = await this.http.request('POST', `${this.repo}/git/tags`, {
      body: {tag, message: `Manual tag ${tag}`, object: sha, type: 'commit'},
    });

    await this.http.request('POST', `${this.repo}/git/refs`, {
      body: {ref: `refs/tags/${tag}`, sha: data.sha as string},
    });
  }

  async releaseBody(tag: string): Promise<string | null> {
    const response = await this.http.request(
      'GET',
      `${this.repo}/releases/tags/${encodeURIComponent(tag)}`,
      {allow: [404]},
    );

    return response.status === 404
      ? null
      : ((response.data.body as string | null) ?? '');
  }

  async runRelwolf(
    branch: string,
    configYaml = '',
    releaseAs?: string,
  ): Promise<RunResult> {
    return run({
      cwd: this.checkout(branch),
      config: parseConfig(`branch: ${branch}\n${configYaml}`),
      provider: new GitHubProvider({
        apiUrl: this.apiUrl,
        repository: this.repository,
        token: this.token,
      }),
      currentBranch: branch,
      defaultBranch: MAIN,
      releaseAs,
      log: process.env.E2E_DEBUG ? console.log : undefined,
    });
  }

  private async headSha(branch: string): Promise<string> {
    const {data} = await this.http.request(
      'GET',
      `${this.repo}/git/ref/heads/${encodeRef(branch)}`,
    );

    return data.object.sha as string;
  }

  private checkout(branch: string): string {
    const dir = checkoutBranch({
      repositoryUrl: this.repositoryUrl,
      username: 'x-access-token',
      token: this.token,
      branch,
    });

    this.dirs.push(dir);

    return dir;
  }

  /** Removes everything the scenarios created: releases, tags, e2e branches and open or pending pull requests. */
  async cleanup(): Promise<void> {
    for (const dir of this.dirs.splice(0)) {
      rmSync(dir, {recursive: true, force: true});
    }

    const releases = await this.http.requestAll(`${this.repo}/releases`, {
      per_page: '100',
    });

    for (const release of releases as Array<{id: number}>) {
      await this.http.request('DELETE', `${this.repo}/releases/${release.id}`, {
        allow: [404],
      });
    }

    const tags = await this.http.requestAll(
      `${this.repo}/git/matching-refs/tags`,
      {per_page: '100'},
    );

    for (const tag of tags as Array<{ref: string}>) {
      await this.http.request(
        'DELETE',
        `${this.repo}/git/${encodeRef(tag.ref)}`,
        {allow: [404, 422]},
      );
    }

    const open = (await this.http.requestAll(`${this.repo}/pulls`, {
      state: 'open',
      per_page: '100',
    })) as Array<{number: number}>;

    for (const pull of open) {
      await this.http.request('PATCH', `${this.repo}/pulls/${pull.number}`, {
        body: {state: 'closed'},
      });
    }

    // Merged pull requests cannot be deleted; take the pending label off so they are never tagged by a later run.
    const pending = (await this.http.requestAll(`${this.repo}/issues`, {
      labels: PENDING_LABEL,
      state: 'closed',
      per_page: '100',
    })) as Array<{number: number; pull_request?: unknown}>;

    for (const issue of pending.filter(item => item.pull_request)) {
      await this.http.request(
        'DELETE',
        `${this.repo}/issues/${issue.number}/labels/${encodeURIComponent(PENDING_LABEL)}`,
        {allow: [404]},
      );
    }

    const branches = await this.http.requestAll(`${this.repo}/branches`, {
      per_page: '100',
    });

    for (const branch of branches as Array<{name: string}>) {
      if (!/^(relwolf\/)?e2e-/.test(branch.name)) {
        continue;
      }

      await this.http.request(
        'DELETE',
        `${this.repo}/git/refs/heads/${encodeRef(branch.name)}`,
        {allow: [404, 422]},
      );
    }
  }
}
