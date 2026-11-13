import {rmSync} from 'node:fs';
import {parseConfig} from '../src/config.js';
import {GitLabProvider} from '../src/providers/gitlab.js';
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

/** A dedicated GitLab project used as a sandbox. */
export class GitLabSandbox implements Sandbox {
  private readonly http: HttpClient;
  private readonly project: string;
  private readonly dirs: Array<string> = [];
  private repositoryUrl = '';

  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly projectId: string,
  ) {
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
    return newBranchName();
  }

  async createBranch(branch: string): Promise<void> {
    await this.http.request('POST', `${this.project}/repository/branches`, {
      body: {branch, ref: MAIN},
    });
  }

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

  async releaseRequest(iid: number): Promise<ReleaseRequestInfo> {
    const {data} = await this.http.request(
      'GET',
      `${this.project}/merge_requests/${iid}`,
    );

    return {
      title: data.title as string,
      body: (data.description as string | null) ?? '',
      state:
        data.state === 'opened'
          ? 'open'
          : data.state === 'merged'
            ? 'merged'
            : 'closed',
      labels: data.labels as Array<string>,
      sourceBranch: data.source_branch as string,
    };
  }

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
      if ((await this.releaseRequest(iid)).state === 'merged') {
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

  async createTag(tag: string, sha: string): Promise<void> {
    await this.http.request('POST', `${this.project}/repository/tags`, {
      body: {tag_name: tag, ref: sha, message: `Manual tag ${tag}`},
    });
  }

  async releaseBody(tag: string): Promise<string | null> {
    const response = await this.http.request(
      'GET',
      `${this.project}/releases/${encodeURIComponent(tag)}`,
      {allow: [404]},
    );

    return response.status === 404
      ? null
      : ((response.data.description as string | null) ?? '');
  }

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
      log: process.env.E2E_DEBUG ? console.log : undefined,
    });
  }

  private checkout(branch: string): string {
    const dir = checkoutBranch({
      repositoryUrl: this.repositoryUrl,
      username: 'oauth2',
      token: this.token,
      branch,
    });

    this.dirs.push(dir);

    return dir;
  }

  /** Removes everything the scenarios created: releases, tags, e2e branches and open or pending merge requests. */
  async cleanup(): Promise<void> {
    for (const dir of this.dirs.splice(0)) {
      rmSync(dir, {recursive: true, force: true});
    }

    const releases = await this.http.requestAll(`${this.project}/releases`);

    for (const release of releases as Array<{tag_name: string}>) {
      await this.http.request(
        'DELETE',
        `${this.project}/releases/${encodeURIComponent(release.tag_name)}`,
        {allow: [404]},
      );
    }

    const tags = await this.http.requestAll(`${this.project}/repository/tags`);

    for (const tag of tags as Array<{name: string}>) {
      await this.http.request(
        'DELETE',
        `${this.project}/repository/tags/${encodeURIComponent(tag.name)}`,
        {allow: [404]},
      );
    }

    const open = (await this.http.requestAll(`${this.project}/merge_requests`, {
      state: 'opened',
    })) as Array<{iid: number}>;

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
    )) as Array<{iid: number}>;

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

    for (const branch of branches as Array<{name: string}>) {
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
