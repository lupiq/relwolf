import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {
  FileChange,
  LabelDefinition,
  Provider,
  ReleaseRequest,
} from '../src/providers/types.js';

export class TestRepo {
  readonly dir: string;

  constructor() {
    this.dir = mkdtempSync(path.join(tmpdir(), 'relwolf-test-'));
    this.git('init', '-q', '-b', 'main');
    this.git('config', 'user.email', 'test@example.com');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'commit.gpgsign', 'false');
    this.git('config', 'tag.gpgsign', 'false');
  }

  git(...args: Array<string>): string {
    return execFileSync('git', args, {cwd: this.dir, encoding: 'utf8'}).trim();
  }

  write(file: string, content: string): void {
    const full = path.join(this.dir, file);

    mkdirSync(path.dirname(full), {recursive: true});
    writeFileSync(full, content);
  }

  /** Commits a change; touches `file` (default: a file named after the commit counter) to have something to commit. */
  commit(message: string, file = 'file.txt'): string {
    this.write(file, `${Math.random()}\n`);
    this.git('add', '-A');
    this.git('commit', '-q', '-m', message);

    return this.git('rev-parse', 'HEAD');
  }

  tag(name: string): void {
    this.git('tag', name);
  }

  head(): string {
    return this.git('rev-parse', 'HEAD');
  }

  cleanup(): void {
    rmSync(this.dir, {recursive: true, force: true});
  }
}

interface CommitCall {
  branch: string;
  baseSha: string;
  message: string;
  files: Array<FileChange>;
}

/** In-memory provider recording every call; merge requests live in a simple array. */
export class FakeProvider implements Provider {
  readonly name = 'fake';
  requests: Array<
    ReleaseRequest & {
      sourceBranch: string;
      targetBranch: string;
      assignees?: Array<string>;
      reviewers?: Array<string>;
    }
  > = [];
  commits: Array<CommitCall> = [];
  tags = new Map<string, string>();
  releases: Array<{
    tag: string;
    name: string;
    body: string;
    prerelease: boolean;
  }> = [];
  labels: Array<string> = [];
  private nextId = 1;

  async ensureLabel(label: LabelDefinition): Promise<void> {
    if (!this.labels.includes(label.name)) {
      this.labels.push(label.name);
    }
  }

  async commitFiles(options: CommitCall): Promise<void> {
    this.commits.push(options);
  }

  async findOpenReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ReleaseRequest | null> {
    return (
      this.requests.find(
        r =>
          r.state === 'open' &&
          r.sourceBranch === options.sourceBranch &&
          r.targetBranch === options.targetBranch,
      ) ?? null
    );
  }

  async createReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    labels: Array<string>;
    draft?: boolean;
    assignees?: Array<string>;
    reviewers?: Array<string>;
  }): Promise<ReleaseRequest> {
    const request = {
      id: this.nextId++,
      title: options.title,
      body: options.body,
      url: `https://example.test/mr/${this.nextId - 1}`,
      state: 'open' as const,
      labels: [...options.labels],
      draft: options.draft ?? false,
      assignees: options.assignees ?? [],
      reviewers: options.reviewers ?? [],
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
    };

    this.requests.push(request);

    return request;
  }

  async updateReleaseRequest(
    id: number,
    options: {title: string; body: string; draft?: boolean},
  ): Promise<void> {
    Object.assign(this.mustFind(id), {
      title: options.title,
      body: options.body,
    });
  }

  async closeReleaseRequest(id: number): Promise<void> {
    this.mustFind(id).state = 'closed';
  }

  async listMergedReleaseRequests(options: {
    targetBranch: string;
    label: string;
  }): Promise<Array<ReleaseRequest>> {
    return this.requests.filter(
      r =>
        r.state === 'merged' &&
        r.targetBranch === options.targetBranch &&
        r.labels.includes(options.label),
    );
  }

  async setLabels(
    id: number,
    options: {add: Array<string>; remove: Array<string>},
  ): Promise<void> {
    const request = this.mustFind(id);

    request.labels = [
      ...request.labels.filter(l => !options.remove.includes(l)),
      ...options.add,
    ];
  }

  async createTag(name: string, sha: string): Promise<'created' | 'exists'> {
    if (this.tags.has(name)) {
      return 'exists';
    }

    this.tags.set(name, sha);

    return 'created';
  }

  async releaseExists(tag: string): Promise<boolean> {
    return this.releases.some(r => r.tag === tag);
  }

  async createRelease(options: {
    tag: string;
    name: string;
    body: string;
    prerelease: boolean;
  }): Promise<void> {
    this.releases.push(options);
  }

  mustFind(id: number) {
    const request = this.requests.find(r => r.id === id);

    if (!request) {
      throw new Error(`no request ${id}`);
    }

    return request;
  }
}

/** Applies the last recorded provider commit to `repo` as a new commit on main and marks the request merged. */
export function mergeLastRelease(
  repo: TestRepo,
  provider: FakeProvider,
  requestId: number,
): string {
  const last = provider.commits.at(-1);

  if (!last) {
    throw new Error('no release commit recorded');
  }

  for (const file of last.files) {
    repo.write(file.path, file.content);
  }

  repo.git('add', '-A');
  repo.git('commit', '-q', '-m', last.message);
  const sha = repo.head();
  const request = provider.mustFind(requestId);

  request.state = 'merged';
  request.mergeSha = sha;

  return sha;
}
