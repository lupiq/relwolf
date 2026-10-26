export type ReleaseRequestState = 'open' | 'merged' | 'closed';

/** A merge request (GitLab) / pull request (GitHub). */
export interface ReleaseRequest {
  id: number;
  title: string;
  body: string;
  url: string;
  state: ReleaseRequestState;
  labels: Array<string>;
  /** Whether the request is a draft (GitLab: title prefix "Draft: ", which is not part of `title`). */
  draft: boolean;
  /** Commit on the target branch that contains the merged changes (merged requests only). */
  mergeSha?: string | undefined;
}

export interface FileChange {
  path: string;
  content: string;
  /** Whether the file already exists at the base commit. */
  exists: boolean;
}

export interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

/**
 * Everything relwolf needs from a hosting platform. Implementations must be
 * idempotent where noted so that re-running a job is always safe.
 */
export interface Provider {
  readonly name: string;

  ensureLabel(label: LabelDefinition): Promise<void>;

  /** Creates or force-updates `branch` as a single commit on top of `baseSha`. */
  commitFiles(options: {
    branch: string;
    baseSha: string;
    message: string;
    files: Array<FileChange>;
  }): Promise<void>;

  findOpenReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ReleaseRequest | null>;

  createReleaseRequest(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    labels: Array<string>;
    draft: boolean;
    /** Usernames; unknown users are an error. */
    assignees: Array<string>;
    reviewers: Array<string>;
  }): Promise<ReleaseRequest>;

  updateReleaseRequest(
    id: number,
    /** `draft` keeps the draft state; a request is never turned into a draft later on. */
    options: {title: string; body: string; draft?: boolean},
  ): Promise<void>;

  /** Closes an open release request without merging it. */
  closeReleaseRequest(id: number): Promise<void>;

  listMergedReleaseRequests(options: {
    targetBranch: string;
    label: string;
  }): Promise<Array<ReleaseRequest>>;

  setLabels(
    id: number,
    options: {add: Array<string>; remove: Array<string>},
  ): Promise<void>;

  /** Creates a lightweight tag; resolves to "exists" if it is already present. */
  createTag(name: string, sha: string): Promise<'created' | 'exists'>;

  releaseExists(tag: string): Promise<boolean>;

  createRelease(options: {
    tag: string;
    name: string;
    body: string;
    prerelease: boolean;
  }): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
