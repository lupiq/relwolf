import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {
  LABEL_PENDING,
  LABEL_TAGGED,
  parseBody,
  parseOverrides,
  renderBody,
  renderTitle,
  type BodyEntry,
  type BodyOverride,
} from './body.js';
import {
  generateNotes,
  prependToChangelog,
  type CliffInvocation,
} from './changelog.js';
import type {Config} from './config.js';
import {Git} from './git.js';
import {nestedPackagePaths, planPackage, type PackagePlan} from './plan.js';
import type {FileChange, Provider} from './providers/types.js';
import {
  componentKey,
  describeRequest,
  parseReleaseAs,
  type ReleaseAs,
} from './release-as.js';
import {applyUpdater} from './updaters/index.js';
import {formatVersion, parseVersion, type Version} from './version.js';

export interface RunOptions {
  /** Working directory of the checked-out repository. */
  cwd: string;
  config: Config;
  provider: Provider;
  /** Branch of the current CI job; empty for tag/merge-request pipelines. */
  currentBranch: string;
  defaultBranch?: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Value of RELWOLF_RELEASE_AS: requests an explicit version for the next release. */
  releaseAs?: string | undefined;
  log?: (message: string) => void;
}

export interface RunResult {
  skipped?: string;
  tagged: string[];
  releaseRequest?: {
    id: number;
    url: string;
    action: 'created' | 'updated' | 'unchanged';
  };
}

const LABELS = {
  pending: {
    name: LABEL_PENDING,
    color: 'fbca04',
    description: 'Release prepared by relwolf, waiting to be merged',
  },
  tagged: {
    name: LABEL_TAGGED,
    color: '0e8a16',
    description: 'Release created by relwolf',
  },
};

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunError';
  }
}

export function resolveBranch(config: Config, defaultBranch?: string): string {
  return config.branch ?? defaultBranch ?? 'main';
}

export async function run(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? (() => undefined);
  const branch = resolveBranch(options.config, options.defaultBranch);

  if (options.currentBranch !== branch) {
    const reason = options.currentBranch
      ? `current branch "${options.currentBranch}" is not the release branch "${branch}"`
      : `this is not a branch pipeline for the release branch "${branch}"`;
    log(`Nothing to do: ${reason}.`);
    return {skipped: reason, tagged: []};
  }

  const git = new Git(options.cwd);
  if (await git.isShallow()) {
    throw new RunError(
      'The repository is a shallow clone. relwolf needs the full history and all tags; ' +
        'set the variable GIT_DEPTH to 0 for the job (GitLab: variables: { GIT_DEPTH: 0 }).',
    );
  }

  const requested = parseReleaseAs(options.releaseAs, options.config.packages);

  const tagged = await tagMergedReleases(options, git, branch, log);
  const releaseRequest = await prepareReleaseRequest(
    options,
    git,
    branch,
    requested,
    log,
  );
  return {tagged, ...(releaseRequest ? {releaseRequest} : {})};
}

async function tagMergedReleases(
  options: RunOptions,
  git: Git,
  branch: string,
  log: (message: string) => void,
): Promise<string[]> {
  const {provider} = options;
  const merged = await provider.listMergedReleaseRequests({
    targetBranch: branch,
    label: LABEL_PENDING,
  });
  const created: string[] = [];

  for (const request of merged) {
    const entries = parseBody(request.body);
    if (entries.length === 0) {
      throw new RunError(
        `Merged release request #${request.id} (${request.url}) contains no release information.`,
      );
    }
    if (!request.mergeSha) {
      throw new RunError(
        `Cannot determine the merge commit of release request #${request.id} (${request.url}).`,
      );
    }
    if (!(await git.isAncestorOfHead(request.mergeSha))) {
      log(
        `Release request #${request.id} was merged in ${request.mergeSha}, which is not part of this checkout yet; a later run will handle it.`,
      );
      continue;
    }

    await provider.ensureLabel(LABELS.tagged);
    for (const entry of entries) {
      const result = await provider.createTag(entry.tag, request.mergeSha);
      log(
        result === 'created'
          ? `Created tag ${entry.tag}.`
          : `Tag ${entry.tag} already exists.`,
      );
      if (!(await git.hasTag(entry.tag)))
        await git.createLightweightTag(entry.tag, request.mergeSha);

      if (await provider.releaseExists(entry.tag)) {
        log(`Release ${entry.tag} already exists.`);
      } else {
        await provider.createRelease({
          tag: entry.tag,
          name: entry.tag,
          body: entry.notes,
          prerelease: entry.prerelease,
        });
        log(`Created release ${entry.tag}.`);
      }
      created.push(entry.tag);
    }
    await provider.setLabels(request.id, {
      add: [LABEL_TAGGED],
      remove: [LABEL_PENDING],
    });
  }
  return created;
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function buildFiles(
  options: RunOptions,
  plans: PackagePlan[],
): Promise<{files: FileChange[]; entries: BodyEntry[]}> {
  const contents = new Map<
    string,
    {original: string | undefined; current: string}
  >();

  const load = async (
    repoPath: string,
    required: boolean,
  ): Promise<{original: string | undefined; current: string}> => {
    const known = contents.get(repoPath);
    if (known) return known;
    const original = await readIfExists(path.join(options.cwd, repoPath));
    if (original === undefined && required) {
      throw new RunError(
        `File "${repoPath}" configured in relwolf.yaml does not exist.`,
      );
    }
    const entry = {original, current: original ?? ''};
    contents.set(repoPath, entry);
    return entry;
  };

  const allPackages = options.config.packages;
  const entries: BodyEntry[] = [];

  for (const plan of plans) {
    const {pkg} = plan;
    const version = formatVersion(plan.version);
    const nested = nestedPackagePaths(pkg, allPackages);
    const cliff: CliffInvocation = {
      cwd: options.cwd,
      configPath: options.config.cliffConfig,
      range: plan.range,
      tag: plan.tag,
      tagPattern: plan.tagPattern,
      includePath: pkg.path === '.' ? undefined : `${pkg.path}/**`,
      excludePaths: nested.map(nestedPath => `${nestedPath}/**`),
      skipCommits: plan.revertedCommits,
    };
    const env = options.env ?? process.env;

    const notes = await generateNotes(cliff, env);
    entries.push({tag: plan.tag, prerelease: plan.prerelease, notes});

    const changelog = await load(pkg.changelogPath, false);
    changelog.current = await prependToChangelog(cliff, changelog.current, env);

    for (const updater of pkg.updaters) {
      const target = await load(updater.path, true);
      target.current = applyUpdater(
        updater.type,
        target.current,
        version,
        updater.path,
      );
    }
  }

  const files: FileChange[] = [];
  for (const [filePath, {original, current}] of contents) {
    if (original === current) continue;
    files.push({
      path: filePath,
      content: current,
      exists: original !== undefined,
    });
  }
  return {files, entries};
}

/** Requests stored in the open release request, updated by the ones given for this run. */
function effectiveRequests(
  options: RunOptions,
  existingBody: string | undefined,
  requested: ReleaseAs,
): Map<string, Version> {
  const keys = new Set(options.config.packages.map(componentKey));
  const versions = new Map<string, Version>();
  for (const {component, version} of parseOverrides(existingBody ?? '')) {
    const parsed = parseVersion(version);
    if (parsed && keys.has(component)) versions.set(component, parsed);
  }
  for (const [key, version] of requested) {
    if (version) versions.set(key, version);
    else versions.delete(key);
  }
  return versions;
}

async function prepareReleaseRequest(
  options: RunOptions,
  git: Git,
  branch: string,
  requested: ReleaseAs,
  log: (message: string) => void,
): Promise<RunResult['releaseRequest'] | undefined> {
  const {provider} = options;
  const sourceBranch = `relwolf/${branch}`;
  const existing = await provider.findOpenReleaseRequest({
    sourceBranch,
    targetBranch: branch,
  });

  const versions = effectiveRequests(options, existing?.body, requested);
  const plans: PackagePlan[] = [];
  for (const pkg of options.config.packages) {
    const releaseAs = versions.get(componentKey(pkg));
    const plan = await planPackage(
      git,
      pkg,
      options.config.packages,
      releaseAs,
    );
    if (plan) {
      if (releaseAs)
        log(
          `Using the requested version ${describeRequest(componentKey(pkg), releaseAs)}.`,
        );
      plans.push(plan);
    }
  }
  if (plans.length === 0) {
    log('No releasable changes (feat, fix or breaking commits) found.');
    if (existing) {
      await provider.closeReleaseRequest(existing.id);
      log(
        `Closed release request #${existing.id} because there is nothing to release anymore.`,
      );
    }
    return undefined;
  }

  const baseSha = await git.head();
  const {files, entries} = await buildFiles(options, plans);
  const title = renderTitle(plans.map(plan => plan.tag));
  const overrides: BodyOverride[] = plans.flatMap(plan => {
    const version = versions.get(componentKey(plan.pkg));
    return version
      ? [{component: componentKey(plan.pkg), version: formatVersion(version)}]
      : [];
  });
  const body = renderBody(entries, baseSha, overrides);
  if (existing?.title === title && existing.body === body) {
    log(`Release request #${existing.id} is up to date: ${existing.url}`);
    return {id: existing.id, url: existing.url, action: 'unchanged'};
  }

  await provider.ensureLabel(LABELS.pending);
  await provider.commitFiles({
    branch: sourceBranch,
    baseSha,
    message: title,
    files,
  });

  if (existing) {
    await provider.updateReleaseRequest(existing.id, {title, body});
    if (!existing.labels.includes(LABEL_PENDING)) {
      await provider.setLabels(existing.id, {add: [LABEL_PENDING], remove: []});
    }
    log(`Updated release request #${existing.id}: ${existing.url}`);
    return {id: existing.id, url: existing.url, action: 'updated'};
  }

  const created = await provider.createReleaseRequest({
    sourceBranch,
    targetBranch: branch,
    title,
    body,
    labels: [LABEL_PENDING],
  });
  log(`Created release request #${created.id}: ${created.url}`);
  return {id: created.id, url: created.url, action: 'created'};
}
