import {HttpClient, type FetchLike} from './http.js';
import type {
  FileChange,
  LabelDefinition,
  Provider,
  ReleaseRequest,
} from './types.js';
import {ProviderError} from './types.js';

export interface GitLabOptions {
  /** e.g. https://gitlab.com/api/v4 */
  apiUrl: string;
  /** Numeric project id or URL-encoded path. */
  projectId: string;
  token: string;
  fetch?: FetchLike;
}

interface GitLabMergeRequest {
  iid: number;
  title: string;
  description: string | null;
  web_url: string;
  state: string;
  labels: string[];
  merge_commit_sha: string | null;
  squash_commit_sha: string | null;
  sha: string | null;
  draft?: boolean;
}

const DRAFT_PREFIX = /^(?:draft:\s*|\[draft\]\s*|\(draft\)\s*)/i;

const withDraft = (title: string, draft: boolean): string =>
  draft ? `Draft: ${title}` : title;

function toReleaseRequest(mr: GitLabMergeRequest): ReleaseRequest {
  const state =
    mr.state === 'opened'
      ? 'open'
      : mr.state === 'merged'
        ? 'merged'
        : 'closed';

  return {
    id: mr.iid,
    title: mr.title.replace(DRAFT_PREFIX, ''),
    body: mr.description ?? '',
    url: mr.web_url,
    state,
    labels: mr.labels,
    draft: mr.draft ?? DRAFT_PREFIX.test(mr.title),
    mergeSha:
      mr.merge_commit_sha ?? mr.squash_commit_sha ?? mr.sha ?? undefined,
  };
}

export class GitLabProvider implements Provider {
  readonly name = 'gitlab';
  private readonly http: HttpClient;
  private readonly project: string;

  constructor(options: GitLabOptions) {
    this.http = new HttpClient(
      options.apiUrl,
      {'PRIVATE-TOKEN': options.token, 'Accept': 'application/json'},
      options.fetch,
    );
    this.project = `/projects/${encodeURIComponent(options.projectId)}`;
  }

  async ensureLabel(label: LabelDefinition): Promise<void> {
    const existing = await this.http.request(
      'GET',
      `${this.project}/labels/${encodeURIComponent(label.name)}`,
      {
        allow: [404],
      },
    );

    if (existing.status !== 404) {
      return;
    }

    await this.http.request('POST', `${this.project}/labels`, {
      body: {
        name: label.name,
        color: `#${label.color}`,
        description: label.description,
      },
      allow: [409],
    });
  }

  async commitFiles(options: {
    branch: string;
    baseSha: string;
    message: string;
    files: FileChange[];
  }): Promise<void> {
    await this.http.request('POST', `${this.project}/repository/commits`, {
      body: {
        branch: options.branch,
        start_sha: options.baseSha,
        force: true,
        commit_message: options.message,
        actions: options.files.map(file => ({
          action: file.exists ? 'update' : 'create',
          file_path: file.path,
          content: file.content,
          encoding: 'text',
        })),
      },
    });
  }

  async findOpenReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ReleaseRequest | null> {
    const {data} = await this.http.request(
      'GET',
      `${this.project}/merge_requests`,
      {
        query: {
          state: 'opened',
          source_branch: options.sourceBranch,
          target_branch: options.targetBranch,
          per_page: '1',
        },
      },
    );
    const [mr] = data as GitLabMergeRequest[];

    return mr ? toReleaseRequest(mr) : null;
  }

  async createReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    labels: string[];
    draft: boolean;
    assignees: string[];
    reviewers: string[];
  }): Promise<ReleaseRequest> {
    const assigneeIds = await this.userIds(options.assignees);
    const reviewerIds = await this.userIds(options.reviewers);
    const {data} = await this.http.request(
      'POST',
      `${this.project}/merge_requests`,
      {
        body: {
          source_branch: options.sourceBranch,
          target_branch: options.targetBranch,
          title: withDraft(options.title, options.draft),
          description: options.body,
          labels: options.labels.join(','),
          ...(assigneeIds.length > 0 ? {assignee_ids: assigneeIds} : {}),
          ...(reviewerIds.length > 0 ? {reviewer_ids: reviewerIds} : {}),
          remove_source_branch: true,
        },
      },
    );

    return toReleaseRequest(data as GitLabMergeRequest);
  }

  async updateReleaseRequest(
    id: number,
    options: {title: string; body: string; draft?: boolean},
  ): Promise<void> {
    await this.http.request('PUT', `${this.project}/merge_requests/${id}`, {
      body: {
        title: withDraft(options.title, options.draft ?? false),
        description: options.body,
      },
    });
  }

  private async userIds(usernames: string[]): Promise<number[]> {
    const ids: number[] = [];

    for (const username of usernames) {
      const {data} = await this.http.request('GET', '/users', {
        query: {username},
      });
      const [user] = data as {id: number}[];

      if (!user) {
        throw new ProviderError(`GitLab user "${username}" not found`);
      }

      ids.push(user.id);
    }

    return ids;
  }

  async closeReleaseRequest(id: number): Promise<void> {
    await this.http.request('PUT', `${this.project}/merge_requests/${id}`, {
      body: {state_event: 'close'},
    });
  }

  async listMergedReleaseRequests(options: {
    targetBranch: string;
    label: string;
  }): Promise<ReleaseRequest[]> {
    const data = await this.http.requestAll(`${this.project}/merge_requests`, {
      state: 'merged',
      target_branch: options.targetBranch,
      labels: options.label,
      order_by: 'updated_at',
      sort: 'asc',
      per_page: '100',
    });

    return (data as GitLabMergeRequest[]).map(toReleaseRequest);
  }

  async setLabels(
    id: number,
    options: {add: string[]; remove: string[]},
  ): Promise<void> {
    await this.http.request('PUT', `${this.project}/merge_requests/${id}`, {
      body: {
        add_labels: options.add.join(','),
        remove_labels: options.remove.join(','),
      },
    });
  }

  async createTag(name: string, sha: string): Promise<'created' | 'exists'> {
    const response = await this.http.request(
      'POST',
      `${this.project}/repository/tags`,
      {
        body: {tag_name: name, ref: sha},
        allow: [400, 409],
      },
    );

    if (response.status < 300) {
      return 'created';
    }

    if (/already exists/i.test(JSON.stringify(response.data))) {
      return 'exists';
    }

    await this.http.request('POST', `${this.project}/repository/tags`, {
      body: {tag_name: name, ref: sha},
    });

    return 'created';
  }

  async releaseExists(tag: string): Promise<boolean> {
    const response = await this.http.request(
      'GET',
      `${this.project}/releases/${encodeURIComponent(tag)}`,
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
    await this.http.request('POST', `${this.project}/releases`, {
      body: {
        tag_name: options.tag,
        name: options.name,
        description: options.body,
      },
    });
  }
}
