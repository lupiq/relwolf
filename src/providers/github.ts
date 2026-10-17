import {HttpClient, type FetchLike} from './http.js';
import type {
  FileChange,
  LabelDefinition,
  Provider,
  ReleaseRequest,
} from './types.js';

export interface GitHubOptions {
  /** e.g. https://api.github.com */
  apiUrl: string;
  /** "owner/name" */
  repository: string;
  token: string;
  fetch?: FetchLike;
}

interface GitHubPull {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  labels: {name: string}[];
  base?: {ref: string};
}

const encodeRef = (ref: string): string =>
  ref.split('/').map(encodeURIComponent).join('/');

function toReleaseRequest(pull: GitHubPull): ReleaseRequest {
  const state = pull.merged_at
    ? 'merged'
    : pull.state === 'open'
      ? 'open'
      : 'closed';
  return {
    id: pull.number,
    title: pull.title,
    body: pull.body ?? '',
    url: pull.html_url,
    state,
    labels: pull.labels.map(label => label.name),
    mergeSha: pull.merge_commit_sha ?? undefined,
  };
}

export class GitHubProvider implements Provider {
  readonly name = 'github';
  private readonly http: HttpClient;
  private readonly repo: string;
  private readonly owner: string;

  constructor(options: GitHubOptions) {
    const [owner, name] = options.repository.split('/');
    if (!owner || !name)
      throw new Error(
        `Invalid GitHub repository "${options.repository}", expected "owner/name"`,
      );
    this.owner = owner;
    this.repo = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    this.http = new HttpClient(
      options.apiUrl,
      {
        'Authorization': `Bearer ${options.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      options.fetch,
    );
  }

  async ensureLabel(label: LabelDefinition): Promise<void> {
    const existing = await this.http.request(
      'GET',
      `${this.repo}/labels/${encodeURIComponent(label.name)}`,
      {
        allow: [404],
      },
    );
    if (existing.status !== 404) return;
    await this.http.request('POST', `${this.repo}/labels`, {
      body: {
        name: label.name,
        color: label.color,
        description: label.description,
      },
      allow: [422],
    });
  }

  async commitFiles(options: {
    branch: string;
    baseSha: string;
    message: string;
    files: FileChange[];
  }): Promise<void> {
    const {data: baseCommit} = await this.http.request(
      'GET',
      `${this.repo}/git/commits/${options.baseSha}`,
    );
    const {data: tree} = await this.http.request(
      'POST',
      `${this.repo}/git/trees`,
      {
        body: {
          base_tree: baseCommit.tree.sha,
          tree: options.files.map(file => ({
            path: file.path,
            mode: '100644',
            type: 'blob',
            content: file.content,
          })),
        },
      },
    );
    const {data: commit} = await this.http.request(
      'POST',
      `${this.repo}/git/commits`,
      {
        body: {
          message: options.message,
          tree: tree.sha,
          parents: [options.baseSha],
        },
      },
    );

    const ref = `heads/${encodeRef(options.branch)}`;
    const existing = await this.http.request(
      'GET',
      `${this.repo}/git/ref/${ref}`,
      {allow: [404]},
    );
    if (existing.status === 404) {
      await this.http.request('POST', `${this.repo}/git/refs`, {
        body: {ref: `refs/heads/${options.branch}`, sha: commit.sha},
      });
    } else {
      await this.http.request('PATCH', `${this.repo}/git/refs/${ref}`, {
        body: {sha: commit.sha, force: true},
      });
    }
  }

  async findOpenReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ReleaseRequest | null> {
    const {data} = await this.http.request('GET', `${this.repo}/pulls`, {
      query: {
        state: 'open',
        head: `${this.owner}:${options.sourceBranch}`,
        base: options.targetBranch,
        per_page: '1',
      },
    });
    const [pull] = data as GitHubPull[];
    return pull ? toReleaseRequest(pull) : null;
  }

  async createReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    labels: string[];
  }): Promise<ReleaseRequest> {
    const {data} = await this.http.request('POST', `${this.repo}/pulls`, {
      body: {
        title: options.title,
        head: options.sourceBranch,
        base: options.targetBranch,
        body: options.body,
      },
    });
    const pull = data as GitHubPull;
    await this.setLabels(pull.number, {add: options.labels, remove: []});
    return toReleaseRequest({
      ...pull,
      labels: options.labels.map(name => ({name})),
    });
  }

  async updateReleaseRequest(
    id: number,
    options: {title: string; body: string},
  ): Promise<void> {
    await this.http.request('PATCH', `${this.repo}/pulls/${id}`, {
      body: {title: options.title, body: options.body},
    });
  }

  async listMergedReleaseRequests(options: {
    targetBranch: string;
    label: string;
  }): Promise<ReleaseRequest[]> {
    const {data} = await this.http.request('GET', `${this.repo}/issues`, {
      query: {
        labels: options.label,
        state: 'closed',
        sort: 'updated',
        direction: 'asc',
        per_page: '100',
      },
    });
    const merged: ReleaseRequest[] = [];
    for (const issue of data as {
      number: number;
      pull_request?: unknown;
    }[]) {
      if (!issue.pull_request) continue;
      const {data: pull} = await this.http.request(
        'GET',
        `${this.repo}/pulls/${issue.number}`,
      );
      const candidate = pull as GitHubPull;
      if (candidate.merged_at && candidate.base?.ref === options.targetBranch) {
        merged.push(toReleaseRequest(candidate));
      }
    }
    return merged;
  }

  async setLabels(
    id: number,
    options: {add: string[]; remove: string[]},
  ): Promise<void> {
    if (options.add.length > 0) {
      await this.http.request('POST', `${this.repo}/issues/${id}/labels`, {
        body: {labels: options.add},
      });
    }
    for (const label of options.remove) {
      await this.http.request(
        'DELETE',
        `${this.repo}/issues/${id}/labels/${encodeURIComponent(label)}`,
        {
          allow: [404],
        },
      );
    }
  }

  async createTag(name: string, sha: string): Promise<'created' | 'exists'> {
    const response = await this.http.request('POST', `${this.repo}/git/refs`, {
      body: {ref: `refs/tags/${name}`, sha},
      allow: [422],
    });
    if (response.status < 300) return 'created';
    if (/already exists/i.test(JSON.stringify(response.data))) return 'exists';
    throw new Error(
      `Could not create tag ${name}: ${JSON.stringify(response.data)}`,
    );
  }

  async releaseExists(tag: string): Promise<boolean> {
    const response = await this.http.request(
      'GET',
      `${this.repo}/releases/tags/${encodeURIComponent(tag)}`,
      {
        allow: [404],
      },
    );
    return response.status !== 404;
  }

  async createRelease(options: {
    tag: string;
    name: string;
    body: string;
    prerelease: boolean;
  }): Promise<void> {
    await this.http.request('POST', `${this.repo}/releases`, {
      body: {
        tag_name: options.tag,
        name: options.name,
        body: options.body,
        prerelease: options.prerelease,
      },
    });
  }
}
