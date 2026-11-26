import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  generateSummary,
  inputHash,
  outputHash,
  prependFileEntry,
  RELEASE_TARGET,
  renderFileEntry,
  usageCost,
  type StoredSummary,
  type SummaryInput,
} from './ai-release-notes.js';
import {
  addUsage,
  parseUsage,
  renderUsage,
  USAGE_MARKER,
  type UsageTotals,
} from './ai-usage.js';
import {
  DEFAULT_RELEASE_TEXT,
  parseBody,
  parseDetails,
  parseOverrides,
  parseSummaries,
  releaseText,
  renderBody,
  renderReleaseName,
  renderTitle,
  type BodyEntry,
  type BodyOverride,
} from './body.js';
import {
  applyChangelogLinks,
  applyChangelogTitle,
  generateNotes,
  prependToChangelog,
  rewriteChangelog,
  type CliffInvocation,
  type RewriteRelease,
} from './changelog.js';
import {
  applyChangesets,
  extractNotes,
  loadWorkspace,
  readReleasePlan,
  type ChangesetsPlan,
  type ChangesetsRelease,
  type Workspace,
} from './changesets.js';
import {
  aiAppliesTo,
  resolveAiFile,
  resolveAiPlaceholders,
  ROOT_KEY,
  tagPackagePath,
  type AiSettings,
  type Config,
  type PackageConfig,
} from './config.js';
import {leadingEmoji, randomEmoji} from './emoji.js';
import {CommandError, Git, run as runCommand} from './git.js';
import {
  buildMessages,
  MESSAGE_WEBHOOK_ENV,
  sendMessage,
  validWebhookUrl,
  type CreatedRelease,
} from './notify.js';
import {
  maxLevel,
  nestedPackagePaths,
  pathspecsFor,
  planPackage,
  type PackagePlan,
  type PlanSettings,
} from './plan.js';
import type {FileChange, Provider, ReleaseRequest} from './providers/types.js';
import {
  componentKey,
  describeRequest,
  parseReleaseAs,
  type ReleaseAs,
} from './release-as.js';
import {
  findReleaseTags,
  isValidReleaseTag,
  parseReleaseTag,
  tagName,
} from './tags.js';
import {
  applyUpdater,
  companions,
  updateComponentMarkers,
} from './updaters/index.js';
import {
  compareVersions,
  formatVersion,
  parseVersion,
  type Version,
} from './version.js';

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
  /** Random source for `release-emoji`, `Math.random` by default. */
  random?: () => number;
}

export interface ReleaseRequestResult {
  id: number;
  url: string;
  action: 'created' | 'updated' | 'unchanged';
}

export interface RunResult {
  skipped?: string;
  tagged: Array<string>;
  /** One entry per release request touched in this run (several with `separate-pull-requests`). */
  releaseRequests: Array<ReleaseRequestResult>;
}

const labelDefinitions = (config: Config) => ({
  pending: {
    name: config.labels.pending,
    color: 'fbca04',
    description: 'Release prepared by relwolf, waiting to be merged',
  },
  tagged: {
    name: config.labels.tagged,
    color: '0e8a16',
    description: 'Release created by relwolf',
  },
});

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

    return {skipped: reason, tagged: [], releaseRequests: []};
  }

  const git = new Git(options.cwd);

  if (await git.isShallow()) {
    throw new RunError(
      'The repository is a shallow clone. relwolf needs the full history and all tags; ' +
        'set the variable GIT_DEPTH to 0 for the job (GitLab: variables: { GIT_DEPTH: 0 }).',
    );
  }

  let workspace: Workspace | undefined;

  if (options.config.strategy === 'changesets') {
    if (options.releaseAs?.trim()) {
      throw new RunError(
        'RELWOLF_RELEASE_AS is not supported with strategy changesets; add a changeset with the wanted bump instead.',
      );
    }

    workspace = await loadWorkspace(options.cwd);
    // Packages come from the workspace, so that tags, release names and component markers work as usual.
    options = {
      ...options,
      config: {...options.config, packages: workspace.packageConfigs},
    };
  }

  const requested = parseReleaseAs(options.releaseAs, options.config.packages);

  log(
    `Release branch "${branch}" on ${options.provider.name}; ${describePackages(options.config)}.`,
  );

  log('Phase 1: tag merged release requests.');

  const tagged = await tagMergedReleases(options, git, branch, log);

  log('Phase 2: prepare the next release.');

  const releaseRequests: Array<ReleaseRequestResult> = [];
  const units = releaseUnits(options.config);

  for (const unit of units) {
    const result = await prepareReleaseRequest(
      options,
      git,
      branch,
      unit,
      units.length > 1,
      requested,
      workspace,
      log,
    );

    if (result) {
      releaseRequests.push(result);
    }
  }

  log(describeOutcome(tagged, releaseRequests));

  return {tagged, releaseRequests};
}

function describeOutcome(
  tagged: Array<string>,
  releaseRequests: Array<ReleaseRequestResult>,
): string {
  return (
    `Done: ${tagged.length === 0 ? 'nothing tagged' : `tagged ${tagged.join(', ')}`}; ` +
    (releaseRequests.length === 0
      ? 'no release request open.'
      : `${releaseRequests.map(request => `#${request.id} ${request.action}`).join(', ')}.`)
  );
}

function describePackages(config: Config): string {
  const count = config.packages.length;

  return `${count === 1 ? '1 package' : `${count} packages`}: ${config.packages.map(packageKey).join(', ')}`;
}

async function tagMergedReleases(
  options: RunOptions,
  git: Git,
  branch: string,
  log: (message: string) => void,
): Promise<Array<string>> {
  const {config} = options;
  const merged = await options.provider.listMergedReleaseRequests({
    targetBranch: branch,
    label: config.labels.pending,
  });
  const created: Array<string> = [];

  log(
    merged.length === 0
      ? `No merged release requests labelled "${config.labels.pending}".`
      : `Found ${merged.length} merged release request(s) labelled "${config.labels.pending}".`,
  );

  for (const request of merged) {
    const untrusted = untrustedReason(request, config.branchPrefix, branch);

    if (untrusted) {
      log(
        `Skipping release request #${request.id} (${request.url}): ${untrusted}. ` +
          `Remove the label "${config.labels.pending}" from it.`,
      );
      continue;
    }

    created.push(...(await tagMergedRequest(options, git, request, log)));
  }

  return created;
}

/** Labels and bodies can be edited by others; only requests from relwolf's own release branches are tagged. */
function untrustedReason(
  request: ReleaseRequest,
  branchPrefix: string,
  branch: string,
): string | undefined {
  if (request.fork) {
    return 'it comes from a fork';
  }

  const releaseBranch = `${branchPrefix}${branch}`;

  if (
    request.sourceBranch !== releaseBranch &&
    !(
      request.sourceBranch.startsWith(`${releaseBranch}/`) &&
      request.sourceBranch.length > releaseBranch.length + 1
    )
  ) {
    return `its source branch "${request.sourceBranch}" is not the release branch "${releaseBranch}" or "${releaseBranch}/<unit>"`;
  }

  return undefined;
}

/** Tags and releases one merged release request; returns no tags if its merge commit is not checked out yet. */
async function tagMergedRequest(
  options: RunOptions,
  git: Git,
  request: ReleaseRequest,
  log: (message: string) => void,
): Promise<Array<string>> {
  const {provider, config} = options;
  const entries = parseBody(request.body, tag =>
    isValidReleaseTag(tag, config.packages),
  );

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

    return [];
  }

  await provider.ensureLabel(labelDefinitions(config).tagged);

  const details = parseDetails(request.body);
  const intro = releaseText(details.text ?? '');
  const summaries = config.aiReleaseNotes.release
    ? parseSummaries(request.body, tag =>
        isValidReleaseTag(tag, config.packages),
      ).filter(summary => summary.target === RELEASE_TARGET)
    : [];
  const created: Array<string> = [];
  const createdReleases: Array<CreatedRelease> = [];

  try {
    for (const entry of entries) {
      const release = await tagAndRelease(
        options,
        git,
        entry,
        request.mergeSha,
        details,
        [intro, releaseSummary(summaries, entry.tag)]
          .filter(Boolean)
          .join('\n\n'),
        log,
      );

      created.push(entry.tag);

      if (release) {
        createdReleases.push(release);
      }
    }
  } finally {
    await notifyReleases(
      options,
      createdReleases,
      parseSummaries(request.body, tag =>
        isValidReleaseTag(tag, config.packages),
      ),
      log,
    );
  }

  await provider.setLabels(request.id, {
    add: [config.labels.tagged],
    remove: [config.labels.pending],
  });

  return created;
}

async function tagAndRelease(
  options: RunOptions,
  git: Git,
  entry: BodyEntry,
  mergeSha: string,
  details: ReturnType<typeof parseDetails>,
  intro: string,
  log: (message: string) => void,
): Promise<CreatedRelease | undefined> {
  const {provider, config} = options;
  const result = await provider.createTag(entry.tag, mergeSha);

  if (!result.created && result.sha !== mergeSha) {
    throw new RunError(
      `Tag ${entry.tag} already exists but points to ${result.sha} instead of the merge commit ${mergeSha}. ` +
        'Delete the tag or move it to the merge commit, then re-run relwolf.',
    );
  }

  log(
    result.created
      ? `Created tag ${entry.tag}.`
      : `Tag ${entry.tag} already exists on the merge commit.`,
  );

  if (!(await git.hasTag(entry.tag))) {
    await git.createLightweightTag(entry.tag, mergeSha);
  }

  if (await provider.releaseExists(entry.tag)) {
    log(`Release ${entry.tag} already exists.`);

    return undefined;
  }

  const parsed = parseReleaseTag(entry.tag, config.packages);
  const name = renderReleaseName(details.title ?? config.releaseName, {
    tag: entry.tag,
    version: parsed ? formatVersion(parsed.version) : entry.tag,
    component: parsed?.pkg.component,
  });
  const body = intro ? `${intro}\n\n${entry.notes}` : entry.notes;

  await provider.createRelease({
    tag: entry.tag,
    name,
    body,
    prerelease: entry.prerelease,
  });
  log(`Created release ${entry.tag}.`);

  return parsed
    ? {
        tag: entry.tag,
        name,
        version: formatVersion(parsed.version),
        url: releaseUrl(options.env ?? process.env, entry.tag),
        prerelease: entry.prerelease,
        body,
        notes: entry.notes,
        pkg: parsed.pkg,
      }
    : undefined;
}

/** Sends the configured messages for newly created releases; a failure only logs a warning. */
async function notifyReleases(
  options: RunOptions,
  releases: ReadonlyArray<CreatedRelease>,
  summaries: Parameters<typeof buildMessages>[2],
  log: (message: string) => void,
): Promise<void> {
  const {config} = options;

  if (config.messages.length === 0 || releases.length === 0) {
    return;
  }

  const url = (options.env ?? process.env)[MESSAGE_WEBHOOK_ENV]?.trim();

  if (!url || !validWebhookUrl(url)) {
    log(
      `Warning: no messages sent, ${MESSAGE_WEBHOOK_ENV} is ${url ? 'not a valid http(s) URL' : 'not set'}.`,
    );

    return;
  }

  for (const message of buildMessages(config, releases, summaries)) {
    const tags = message.releases.map(release => release.tag).join(', ');

    try {
      await sendMessage(message, url, config.httpTimeout * 1000);
      log(`Sent the ${message.config.type} message for ${tags}.`);
    } catch (error) {
      log(
        `Warning: could not send the ${message.config.type} message for ${tags}: ${(error as Error).message}`,
      );
    }
  }
}

/** The summary text for a release; one section per package if several share the tag. */
function releaseSummary(
  summaries: ReadonlyArray<StoredSummary>,
  tag: string,
): string {
  const texts = summaries
    .filter(summary => summary.tag === tag)
    .map(summary => ({key: summary.key, text: releaseText(summary.text)}))
    .filter(summary => summary.text);
  const [only] = texts;

  return texts.length === 1 && only
    ? only.text
    : texts.map(({key, text}) => `## ${key}\n\n${text}`).join('\n\n');
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

const GLOB_CHARACTERS = /[*?[]/;

/** A configured file path, or the tracked files matching it if it is a glob. */
async function expandPath(
  git: Git,
  configured: string,
): Promise<Array<string>> {
  if (!GLOB_CHARACTERS.test(configured)) {
    return [configured];
  }

  const files = await git.listFiles(configured);

  if (files.length === 0) {
    throw new RunError(
      `The glob "${configured}" configured in relwolf.yaml matches no file.`,
    );
  }

  return files;
}

/**
 * Runs `body`, which may change the working tree, and resets everything it changed afterwards. `body` gets the files
 * that were already dirty before; they are neither collected nor reset.
 */
async function withWorkingTree<T>(
  git: Git,
  body: (dirty: ReadonlySet<string>) => Promise<T>,
): Promise<T> {
  const dirty = new Set((await git.status()).map(entry => entry.path));

  try {
    return await body(dirty);
  } finally {
    const leftovers = (await git.status()).filter(
      entry => !dirty.has(entry.path),
    );

    await git.discard(leftovers);
  }
}

function checkNotDirty(
  paths: ReadonlyArray<string>,
  dirty: ReadonlySet<string>,
  what: string,
): void {
  const clobbered = paths.filter(file => dirty.has(file));

  if (clobbered.length > 0) {
    throw new RunError(
      `Cannot ${what}: ${clobbered.join(', ')} has uncommitted changes in the working tree. Run relwolf on a clean checkout.`,
    );
  }
}

/** The absolute path of the configured pre-commit-script, if any; fails if it does not exist. */
async function preCommitScriptPath(
  options: RunOptions,
): Promise<string | undefined> {
  const script = options.config.preCommitScript;

  if (!script) {
    return undefined;
  }

  const scriptPath = path.join(options.cwd, script);

  if (!(await stat(scriptPath).catch(() => undefined))?.isFile()) {
    throw new RunError(
      `The pre-commit-script "${script}" configured in relwolf.yaml does not exist.`,
    );
  }

  return scriptPath;
}

/**
 * Writes the release files into the working tree, runs `pre-commit-script` and returns everything that changed
 * (the script may touch or add any file). The working tree is reset afterwards.
 */
async function applyPreCommitScript(
  options: RunOptions,
  git: Git,
  files: Array<FileChange>,
): Promise<Array<FileChange>> {
  const scriptPath = await preCommitScriptPath(options);

  if (!scriptPath) {
    return files;
  }

  return withWorkingTree(git, async dirty => {
    checkNotDirty(
      files.map(file => file.path),
      dirty,
      'run the pre-commit-script',
    );
    await writeFiles(options.cwd, files);
    await runPreCommitScript(options, scriptPath);

    return collectChanges(options.cwd, git, dirty, false);
  });
}

async function writeFiles(
  cwd: string,
  files: Array<FileChange>,
): Promise<void> {
  for (const file of files) {
    const target = path.join(cwd, file.path);

    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, file.content);
  }
}

/** Variables that may hold an API token; the pre-commit-script only gets them with `pre-commit-script-tokens`. */
const TOKEN_VARIABLES = new Set([
  'RELWOLF_TOKEN',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
]);

function preCommitScriptEnv(options: RunOptions): NodeJS.ProcessEnv {
  const env = options.env ?? process.env;

  return options.config.preCommitScriptTokens
    ? env
    : Object.fromEntries(
        Object.entries(env).filter(([name]) => !TOKEN_VARIABLES.has(name)),
      );
}

async function runPreCommitScript(
  options: RunOptions,
  scriptPath: string,
): Promise<void> {
  const script = options.config.preCommitScript;

  options.log?.(`Running pre-commit-script ${script}.`);

  try {
    await runCommand(scriptPath, [], options.cwd, preCommitScriptEnv(options));
  } catch (error) {
    const hint =
      error instanceof CommandError && error.stderr.includes('EACCES')
        ? ' Make it executable (chmod +x) and give it a shebang line.'
        : '';

    throw new RunError(
      `The pre-commit-script "${script}" failed: ${(error as Error).message}${hint}`,
    );
  }
}

/** Files changed in the working tree, excluding those that were already dirty before. */
async function collectChanges(
  cwd: string,
  git: Git,
  dirty: ReadonlySet<string>,
  allowDeletions: boolean,
): Promise<Array<FileChange>> {
  const changed = (await git.status()).filter(entry => !dirty.has(entry.path));
  const result: Array<FileChange> = [];

  for (const entry of changed) {
    if (entry.deleted && allowDeletions) {
      result.push({path: entry.path, content: '', exists: true, deleted: true});
      continue;
    }

    if (entry.deleted) {
      throw new RunError(
        `The pre-commit-script deleted or renamed "${entry.path}", which a release commit cannot express.`,
      );
    }

    result.push({
      path: entry.path,
      content: await readFile(path.join(cwd, entry.path), 'utf8'),
      exists: entry.tracked,
    });
  }

  return result;
}

interface FileState {
  original: string | undefined;
  current: string;
}

type FileLoader = (repoPath: string, required: boolean) => Promise<FileState>;

type NotesByTag = Map<string, Array<{pkg: PackageConfig; notes: string}>>;

/** Loads each file once, so that several updaters work on the same content. */
function createLoader(
  cwd: string,
  contents: Map<string, FileState>,
): FileLoader {
  return async (repoPath, required) => {
    const known = contents.get(repoPath);

    if (known) {
      return known;
    }

    const original = await readIfExists(path.join(cwd, repoPath));

    if (original === undefined && required) {
      throw new RunError(
        `File "${repoPath}" configured in relwolf.yaml does not exist.`,
      );
    }

    const entry = {original, current: original ?? ''};

    contents.set(repoPath, entry);

    return entry;
  };
}

async function buildFiles(
  options: RunOptions,
  git: Git,
  plans: Array<PackagePlan>,
  emoji: string,
  existing: ReleaseRequest | null,
): Promise<{
  files: Array<FileChange>;
  entries: Array<BodyEntry>;
  summaries: SummaryState;
}> {
  const contents = new Map<string, FileState>();
  const load = createLoader(options.cwd, contents);
  const notesByTag: NotesByTag = new Map();
  const summaries: SummaryState = {
    previous: parseSummaries(existing?.body ?? '', tag =>
      plans.some(plan => plan.tag === tag),
    ),
    stored: [],
    warnings: [],
    generated: new Map(),
    usage: {input: 0, output: 0, runs: 0},
  };

  for (const plan of plans) {
    await applyPlan(options, git, plan, load, notesByTag, emoji, summaries);
  }

  await applyComponentUpdaters(
    options,
    git,
    new Map(
      plans.map(plan => [packageKey(plan.pkg), formatVersion(plan.version)]),
    ),
    load,
  );

  const entries = buildEntries(notesByTag, plans);
  const files = changedFiles(contents);

  return {
    files: await applyPreCommitScript(options, git, files),
    entries,
    summaries,
  };
}

/** Whether `rewrite-changelog` applies: the git-cliff config differs from the one of the previous release. */
async function cliffConfigChanged(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
): Promise<boolean> {
  if (!options.config.rewriteChangelog || !plan.previousTag) {
    return false;
  }

  const file = options.config.cliffConfig ?? 'cliff.toml';
  const before = await git.fileAt(plan.previousTag, file);
  const after = await git.fileAt('HEAD', file);

  return before !== after;
}

/**
 * The releases of the package, newest first, up to HEAD (which becomes the new release). Empty if there are no
 * release tags to split the history at.
 */
async function rewriteReleases(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
): Promise<Array<RewriteRelease>> {
  const {bootstrapSha, packages, excludePaths} = options.config;
  const pathspecs = pathspecsFor(plan.pkg, packages, excludePaths);
  const pattern = new RegExp(plan.tagPattern);
  const tags = findReleaseTags(
    (await git.tagsMergedIntoHead()).filter(tag => pattern.test(tag)),
    plan.tagged,
  )
    .sort((a, b) => compareVersions(a.version, b.version))
    .map(({tag}) => tag);
  // Without bootstrap-sha, git-cliff needs a start for the range of the first release; the root commit is left out.
  const first = bootstrapSha ?? (await git.rootCommits())[0];
  const releases: Array<RewriteRelease> = [];

  const commitsOf = async (range: string): Promise<Array<string>> =>
    (await git.log(range, pathspecs)).map(({sha}) => sha);

  for (const [index, tag] of tags.entries()) {
    const previous = tags[index - 1];
    const start = previous ?? first;

    if (!start) {
      return [];
    }

    const range = `${start}..${tag}`;

    // A tag on the start itself has an empty range, which git-cliff cannot render as a release.
    if ((await git.log(range, [])).length === 0) {
      continue;
    }

    releases.push({
      tag,
      previous,
      range,
      commits: await commitsOf(range),
      placeholder: true,
    });
  }

  const last = tags.at(-1);

  if (!last) {
    return [];
  }

  const tail = `${last}..HEAD`;
  const commits = await commitsOf(tail);

  // Without commits the new release is the one without changes, which is handled by the caller.
  if (commits.length > 0) {
    releases.push({
      tag: plan.tag,
      previous: last,
      range: tail,
      commits,
      placeholder: false,
      emoji: true,
    });
  }

  return releases.reverse();
}

/** AI release notes of a release request: stored notes, new notes, and warnings. */
interface SummaryState {
  previous: Array<StoredSummary>;
  stored: Array<StoredSummary>;
  warnings: Array<string>;
  /** Texts generated in this run by input hash, so that outputs with identical settings share one model call. */
  generated: Map<string, string>;
  /** Tokens and cost of the model calls of this run. */
  usage: UsageTotals;
}

/** The empty tree object, so that the first release is diffed against nothing. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function summaryInput(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
  notes: string,
  settings: AiSettings,
): Promise<SummaryInput> {
  const {packages, excludePaths} = options.config;
  const reverted = new Set(plan.revertedCommits);
  const commits = await git.log(
    plan.range,
    pathspecsFor(plan.pkg, packages, excludePaths),
  );

  return {
    tag: plan.tag,
    version: formatVersion(plan.version),
    component: plan.pkg.component,
    notes,
    commits: commits
      .filter(commit => !reverted.has(commit.sha))
      .map(commit => commit.message),
    ...(settings.context === 'full-diff'
      ? {
          diff: await git.diff(
            plan.range ?? `${EMPTY_TREE}..HEAD`,
            pathspecsFor(plan.pkg, packages, [
              ...excludePaths,
              ...settings.excludePaths,
            ]),
            settings.includePaths,
          ),
        }
      : {}),
  };
}

function releaseUrl(env: NodeJS.ProcessEnv, tag: string): string | undefined {
  const encodedTag = encodeURIComponent(tag);

  if (env.GITHUB_REPOSITORY) {
    const server = (env.GITHUB_SERVER_URL ?? 'https://github.com').replace(
      /\/$/,
      '',
    );

    return `${server}/${env.GITHUB_REPOSITORY}/releases/tag/${encodedTag}`;
  }

  if (env.CI_PROJECT_URL) {
    return `${env.CI_PROJECT_URL.replace(/\/$/, '')}/-/releases/${encodedTag}`;
  }

  return undefined;
}

/**
 * The AI release notes of a release, or undefined if disabled or unavailable. Notes stored in the release request are
 * kept if it was edited there or the commits did not change; otherwise it is generated again. Failures only add a
 * warning to the release request.
 */
async function resolveSummary(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
  notes: string,
  state: SummaryState,
  settings: AiSettings,
  target?: string,
): Promise<string | undefined> {
  if (plan.empty) {
    return undefined;
  }

  const key = packageKey(plan.pkg);
  const label = `AI release notes for ${plan.tag}${plan.pkg.component ? ` (${plan.pkg.component})` : ''}${target === RELEASE_TARGET ? ' for the release' : target ? ` in ${target}` : ''}`;
  const input = await summaryInput(options, git, plan, notes, settings);
  const current = inputHash(settings, input);
  const old = state.previous.find(
    summary =>
      summary.tag === plan.tag &&
      summary.key === key &&
      summary.target === target,
  );
  const edited = old !== undefined && outputHash(old.text) !== old.output;

  if (old && (edited || old.input === current)) {
    options.log?.(
      edited
        ? `${label} was edited in the release request, keeping it.`
        : `${label} is up to date.`,
    );
    state.stored.push(old);

    return releaseText(old.text) || undefined;
  }

  const env = options.env ?? process.env;

  if (
    options.config.aiReleaseNotes.generate === 'manual' &&
    env.RELWOLF_GENERATE_AI_RELEASE_NOTES !== 'true'
  ) {
    options.log?.(
      `${old ? `The ${label} is outdated` : `The ${label} was not generated yet`}; generate: manual, run with RELWOLF_GENERATE_AI_RELEASE_NOTES=true to generate it.`,
    );
    state.warnings.push(
      old
        ? `The ${label} is stale: the commits changed since it was generated. Run relwolf with RELWOLF_GENERATE_AI_RELEASE_NOTES=true to update it before merging.`
        : `The ${label} has not been generated yet. Run relwolf with RELWOLF_GENERATE_AI_RELEASE_NOTES=true to generate it before merging.`,
    );

    if (old) {
      state.stored.push(old);
    }

    return old ? releaseText(old.text) || undefined : undefined;
  }

  const shared = state.generated.get(current);

  if (shared !== undefined) {
    options.log?.(
      `The ${label} has the same input as another output, reusing its text.`,
    );
    state.stored.push({
      tag: plan.tag,
      key,
      target,
      input: current,
      output: outputHash(shared),
      text: shared,
    });

    return releaseText(shared) || undefined;
  }

  options.log?.(
    `Generating the ${label} with ${settings.model ?? settings.provider}.`,
  );

  const result = await generateSummary(settings, input, env, {
    timeoutMs: options.config.httpTimeout * 1000,
    ...(options.log ? {log: options.log} : {}),
  });

  if (!result.ok) {
    options.log?.(`The ${label} failed: ${result.error}`);
    state.warnings.push(`The ${label} could not be generated: ${result.error}`);

    if (old) {
      state.stored.push(old);
    }

    return old ? releaseText(old.text) || undefined : undefined;
  }

  if (result.usage) {
    const cost = usageCost(result.usage, settings);

    state.usage.input += result.usage.input;
    state.usage.output += result.usage.output;
    state.usage.runs = 1;

    if (cost !== undefined) {
      state.usage.cost = (state.usage.cost ?? 0) + cost;
    }

    if (result.usage.credits !== undefined) {
      state.usage.credits = (state.usage.credits ?? 0) + result.usage.credits;
    }

    options.log?.(
      `The ${label} used ${result.usage.input} input and ${result.usage.output} output tokens${result.usage.credits === undefined ? '' : `, ${result.usage.credits} AI credits`}${cost === undefined ? '' : ` (about $${cost.toFixed(4)})`}.`,
    );
  }

  state.generated.set(current, result.text);
  state.stored.push({
    tag: plan.tag,
    key,
    target,
    input: current,
    output: outputHash(result.text),
    text: result.text,
  });

  return result.text;
}

/** Generates the notes of a plan, prepends them to the changelog and runs the updaters. */
async function applyPlan(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
  load: FileLoader,
  notesByTag: NotesByTag,
  emoji: string,
  summaries: SummaryState,
): Promise<void> {
  const {pkg} = plan;
  const nested = nestedPackagePaths(pkg, options.config.packages);
  const cliff: CliffInvocation = {
    cwd: options.cwd,
    configPath: options.config.cliffConfig,
    range: plan.range,
    tag: plan.tag,
    tagPattern: plan.tagPattern,
    includePath: pkg.path === '.' ? undefined : `${pkg.path}/**`,
    excludePaths: [
      ...nested.map(nestedPath => `${nestedPath}/**`),
      ...options.config.excludePaths,
    ],
    skipCommits: plan.revertedCommits,
  };
  const env = {
    ...(options.env ?? process.env),
    RELWOLF_RELEASE_EMOJI: emoji,
  };

  const {noChangesText} = options.config;
  let notes =
    plan.empty && noChangesText ? '' : await generateNotes(cliff, env);

  // Commits that the git-cliff config leaves out render like a release without commits.
  const hidden =
    !plan.empty &&
    Boolean(noChangesText) &&
    notes ===
      (await generateNotes(
        {
          ...cliff,
          skipCommits: [
            ...(cliff.skipCommits ?? []),
            ...(
              await git.log(
                plan.range,
                pathspecsFor(
                  pkg,
                  options.config.packages,
                  options.config.excludePaths,
                ),
              )
            ).map(({sha}) => sha),
          ],
        },
        env,
      ));
  const placeholder = plan.empty || hidden ? noChangesText : '';

  notes = placeholder || notes;

  const ai = options.config.aiReleaseNotes;
  const summary =
    placeholder || !ai.changelog || !aiAppliesTo(ai.changelog, pkg)
      ? undefined
      : await resolveSummary(
          options,
          git,
          plan,
          notes,
          summaries,
          ai.changelog,
        );

  // Only stored in the release request; the release body is built from it when the request is merged.
  if (!placeholder && ai.release && aiAppliesTo(ai.release, pkg)) {
    await resolveSummary(
      options,
      git,
      plan,
      notes,
      summaries,
      ai.release,
      RELEASE_TARGET,
    );
  }

  const sections = notesByTag.get(plan.tag) ?? [];

  sections.push({pkg, notes});
  notesByTag.set(plan.tag, sections);

  const changelog = await load(pkg.changelogPath, false);

  if (await cliffConfigChanged(options, git, plan)) {
    options.log?.(
      `[${pkg.component ?? pkg.path}] The git-cliff config changed since ${plan.previousTag}, rewriting the whole changelog.`,
    );

    const {bootstrapSha} = options.config;

    changelog.current = await rewriteChangelog(
      {...cliff, range: bootstrapSha && `${bootstrapSha}..HEAD`},
      env,
      await rewriteReleases(options, git, plan),
      options.config.noChangesText,
    );
    // The rewrite has no entry for a package without changes yet.
    changelog.current = placeholder
      ? await prependToChangelog(cliff, changelog.current, env, placeholder)
      : changelog.current;
  } else {
    changelog.current = await prependToChangelog(
      cliff,
      changelog.current,
      env,
      placeholder,
      summary,
    );
  }

  for (const {
    file: template,
    fileTitle,
    entryTitle,
    ...settings
  } of ai.files.filter(entry => aiAppliesTo(entry, pkg))) {
    const file = resolveAiFile(template, pkg);
    const text =
      placeholder ||
      (await resolveSummary(
        options,
        git,
        plan,
        notes,
        summaries,
        settings,
        file,
      ));

    if (!text) {
      continue;
    }

    const target = await load(file, false);
    const version = formatVersion(plan.version);
    const url = releaseUrl(options.env ?? process.env, plan.tag);

    target.current = prependFileEntry(
      target.current,
      resolveAiPlaceholders(fileTitle, pkg),
      renderFileEntry(
        entryTitle
          ? entryTitle
              .replaceAll('${version}', version)
              .replaceAll('${tag}', plan.tag)
              .replaceAll('${component}', pkg.component ?? '')
          : pkg.component
            ? `${pkg.component} ${version}`
            : version,
        text,
        new Date(),
        {
          ...(emoji ? {emoji} : {}),
          ...(url ? {releaseUrl: url} : {}),
        },
      ),
    );
  }

  changelog.current = applyChangelogTitle(
    changelog.current,
    pkg.component ?? '',
    pkg.changelogTitle,
  );

  if (options.config.changelogLinks && pkg.path === '.') {
    const directory = path.posix.dirname(pkg.changelogPath);

    changelog.current = applyChangelogLinks(
      changelog.current,
      options.config.changelogLinksText,
      options.config.packages
        .filter(other => other !== pkg)
        .map(other => ({
          label: other.component ?? other.path,
          href: path.posix.relative(directory, other.changelogPath),
        })),
    );
  }

  const version = formatVersion(plan.version);

  for (const updater of pkg.updaters) {
    for (const file of await expandPath(git, updater.path)) {
      await updateFile(updater, file, version, load);
    }
  }
}

/**
 * Runs the top-level updaters: every component marker gets the version of its package if that is released now.
 * `versions` maps the package key to the new version.
 */
async function applyComponentUpdaters(
  options: RunOptions,
  git: Git,
  versions: ReadonlyMap<string, string>,
  load: FileLoader,
): Promise<void> {
  const {componentUpdaters, packages} = options.config;
  const known = new Set(packages.map(packageKey));

  for (const updater of componentUpdaters) {
    for (const file of await expandPath(git, updater.path)) {
      const target = await load(file, true);
      const result = updateComponentMarkers(
        target.current,
        versions,
        known,
        file,
      );

      target.current = result.content;

      if (result.unreleased.length > 0) {
        options.log?.(
          `${file}: markers of ${result.unreleased.join(', ')} left unchanged, not released in this request.`,
        );
      }
    }
  }
}

async function updateFile(
  updater: PackageConfig['updaters'][number],
  file: string,
  version: string,
  load: FileLoader,
): Promise<void> {
  const target = await load(file, true);

  target.current = applyUpdater(
    updater.type,
    target.current,
    version,
    file,
    updater.key,
  );

  if (!updater.lockfiles) {
    return;
  }

  for (const companion of companions(updater.type, file, target.current)) {
    const lock = await load(companion.path, false);

    if (lock.original !== undefined) {
      lock.current = companion.update(lock.current, version);
    }
  }
}

function buildEntries(
  notesByTag: NotesByTag,
  plans: Array<PackagePlan>,
): Array<BodyEntry> {
  const entries: Array<BodyEntry> = [];

  for (const [tag, sections] of notesByTag) {
    const [only] = sections;
    // Packages sharing one tag get one section each in the release notes.
    const notes =
      sections.length === 1 && only
        ? only.notes
        : sections
            .filter(section => section.notes.trim())
            .map(
              section =>
                `## ${packageKey(section.pkg)}\n\n${section.notes.trim()}`,
            )
            .join('\n\n');
    const plan = plans.find(candidate => candidate.tag === tag);

    entries.push({tag, prerelease: Boolean(plan?.prerelease), notes});
  }

  return entries;
}

function changedFiles(contents: Map<string, FileState>): Array<FileChange> {
  const files: Array<FileChange> = [];

  for (const [filePath, {original, current}] of contents) {
    // Optional companion files that do not exist are loaded as empty and never written.
    if (original === current || (original === undefined && current === '')) {
      continue;
    }

    files.push({
      path: filePath,
      content: current,
      exists: original !== undefined,
    });
  }

  return files;
}

/** Requests stored in the open release request, updated by the ones given for this run. */
function effectiveRequests(
  packages: ReadonlyArray<PackageConfig>,
  existingBody: string | undefined,
  requested: ReleaseAs,
): Map<string, Version> {
  const keys = new Set(packages.map(componentKey));
  const versions = new Map<string, Version>();

  for (const {component, version} of parseOverrides(existingBody ?? '')) {
    const parsed = parseVersion(version);

    if (parsed && keys.has(component)) {
      versions.set(component, parsed);
    }
  }

  for (const [key, version] of requested) {
    if (version) {
      versions.set(key, version);
    } else {
      versions.delete(key);
    }
  }

  return versions;
}

/** Packages that are released together in one release request. */
interface ReleaseUnit {
  /** Branch suffix; none if there is only one unit. */
  key: string;
  packages: Array<PackageConfig>;
  /** Linked packages (sharing one version) inside this unit. */
  groups: Array<Array<PackageConfig>>;
}

const packageKey = (pkg: PackageConfig): string => pkg.component ?? ROOT_KEY;

export function releaseUnits(config: Config): Array<ReleaseUnit> {
  const groups = config.linkedGroups.map(paths =>
    paths.flatMap(
      groupPath => config.packages.find(pkg => pkg.path === groupPath) ?? [],
    ),
  );

  if (!config.separatePullRequests) {
    return [{key: '', packages: config.packages, groups}];
  }

  const units: Array<ReleaseUnit> = [];
  const seen = new Set<PackageConfig>();

  for (const pkg of config.packages) {
    if (seen.has(pkg)) {
      continue;
    }

    const group = groups.find(members => members.includes(pkg));
    const members = group ?? [pkg];

    members.forEach(member => seen.add(member));
    units.push({
      key: members.map(packageKey).join('+'),
      packages: members,
      groups: group ? [group] : [],
    });
  }

  return units;
}

function planSettings(config: Config): PlanSettings {
  return {
    bumpRules: {minor: config.minorTypes, patch: config.patchTypes},
    excludePaths: config.excludePaths,
    bootstrapSha: config.bootstrapSha,
  };
}

type PlanOptions = Parameters<typeof planPackage>[3];

/** Plans every package of a group with its own options; packages without changes are left out. */
async function planMembers(
  git: Git,
  config: Config,
  group: ReadonlyArray<PackageConfig>,
  optionsFor: (pkg: PackageConfig) => PlanOptions,
): Promise<Array<PackagePlan>> {
  const settings = planSettings(config);
  const plans: Array<PackagePlan> = [];

  for (const pkg of group) {
    const plan = await planPackage(
      git,
      pkg,
      config.packages,
      optionsFor(pkg),
      settings,
    );

    if (plan) {
      plans.push(plan);
    }
  }

  return plans;
}

/** Plans the packages of a linked group: all of them get the highest version any member needs. */
async function planGroup(
  git: Git,
  config: Config,
  group: ReadonlyArray<PackageConfig>,
  versions: Map<string, Version>,
  log: (message: string) => void,
): Promise<Array<PackagePlan>> {
  const tagsOf =
    config.linkedTags === 'single'
      ? group.find(
          pkg => pkg.path === tagPackagePath(group.map(member => member.path)),
        )
      : undefined;
  const changed = await planMembers(git, config, group, pkg => ({
    releaseAs: versions.get(componentKey(pkg)),
    tagsOf,
    log,
  }));

  if (changed.length === 0) {
    return [];
  }

  const level = changed.reduce<ReturnType<typeof maxLevel>>(
    (highest, plan) => maxLevel(highest, plan.level),
    null,
  );
  const candidates: Array<Version> = group.flatMap(
    pkg => versions.get(componentKey(pkg)) ?? [],
  );
  const leveled = await planMembers(git, config, group, () => ({
    minLevel: level,
    force: true,
    tagsOf,
  }));

  candidates.push(...leveled.map(plan => plan.version));

  const [first, ...others] = candidates;

  if (!first) {
    return [];
  }

  const shared = others.reduce(
    (highest, version) =>
      compareVersions(version, highest) > 0 ? version : highest,
    first,
  );
  const plans = await planMembers(git, config, group, () => ({
    releaseAs: shared,
    force: true,
    tagsOf,
  }));

  log(
    `Linked packages (${group.map(packageKey).join(', ')}) share the version ${formatVersion(shared)}.`,
  );

  return plans;
}

async function planUnit(
  git: Git,
  config: Config,
  unit: ReleaseUnit,
  versions: Map<string, Version>,
  log: (message: string) => void,
): Promise<Array<PackagePlan>> {
  const settings = planSettings(config);
  const grouped = new Set(unit.groups.flat());
  const plans: Array<PackagePlan> = [];

  for (const pkg of unit.packages) {
    if (grouped.has(pkg)) {
      continue;
    }

    const releaseAs = versions.get(componentKey(pkg));
    const plan = await planPackage(
      git,
      pkg,
      config.packages,
      {releaseAs, log},
      settings,
    );

    if (plan) {
      if (releaseAs) {
        log(
          `Using the requested version ${describeRequest(componentKey(pkg), releaseAs)}.`,
        );
      }

      plans.push(plan);
    }
  }

  for (const group of unit.groups) {
    plans.push(...(await planGroup(git, config, group, versions, log)));
  }

  return plans.sort(
    (a, b) => config.packages.indexOf(a.pkg) - config.packages.indexOf(b.pkg),
  );
}

/** A package released in a release request. */
interface ReleasedPackage {
  pkg: PackageConfig;
  tag: string;
  version: Version;
}

/** Everything a release request needs, whatever decided the versions. */
interface PreparedRelease {
  /** Released packages that get a tag. */
  released: Array<ReleasedPackage>;
  files: Array<FileChange>;
  entries: Array<BodyEntry>;
  /** Versions requested with RELWOLF_RELEASE_AS, stored in the body. */
  versions: Map<string, Version>;
  emoji: string;
  summaries?: SummaryState;
}

async function prepareConventional(
  options: RunOptions,
  git: Git,
  unit: ReleaseUnit,
  separate: boolean,
  requested: ReleaseAs,
  existing: ReleaseRequest | null,
  log: (message: string) => void,
): Promise<PreparedRelease | undefined> {
  const {config} = options;
  const versions = effectiveRequests(unit.packages, existing?.body, requested);
  const plans = await planUnit(git, config, unit, versions, log);

  if (plans.length === 0) {
    log(
      `No releasable changes found${separate ? ` for ${unit.key}` : ''} (see "patch-types" and "minor-types"; breaking commits always release).`,
    );

    return undefined;
  }

  const emoji = await releaseEmoji(options, existing);
  const {files, entries, summaries} = await buildFiles(
    options,
    git,
    plans,
    emoji,
    existing,
  );

  return {released: plans, files, entries, versions, emoji, summaries};
}

/** Paths in the working tree that changesets may write. */
const changesetsMayTouch = (file: string): boolean =>
  file.startsWith('.changeset/') ||
  ['package.json', 'CHANGELOG.md'].includes(path.posix.basename(file));

/**
 * Lets changesets plan the release and write it into the working tree (reading the pre-release state may migrate it,
 * too), runs the top-level updaters and the pre-commit-script on top and collects every changed file. The working
 * tree is reset afterwards.
 */
async function prepareChangesets(
  options: RunOptions,
  git: Git,
  workspace: Workspace,
  existing: ReleaseRequest | null,
  log: (message: string) => void,
): Promise<PreparedRelease | undefined> {
  const scriptPath = await preCommitScriptPath(options);

  return withWorkingTree(git, async dirty => {
    checkNotDirty(
      [...dirty].filter(changesetsMayTouch),
      dirty,
      'apply the changesets',
    );

    const plan = await readReleasePlan(workspace, log);

    if (!plan) {
      return undefined;
    }

    const tagged = plan.releases.filter(release => release.tagged);

    if (tagged.length === 0) {
      log(
        plan.releases.length === 0
          ? 'The changesets change no version.'
          : 'Only private packages without tags would be released; the changesets stay pending until a tagged package is released too (see "privatePackages" in .changeset/config.json).',
      );

      return undefined;
    }

    await applyChangesets(workspace, plan, options.env ?? process.env, log);
    await applyChangesetsUpdaters(options, git, plan, dirty);

    if (scriptPath) {
      await runPreCommitScript(options, scriptPath);
    }

    const released = tagged.map(release => releasedPackage(release));
    const entries: Array<BodyEntry> = [];

    for (const {pkg, tag, version} of released) {
      const changelog = await readIfExists(
        path.join(options.cwd, pkg.changelogPath),
      );

      entries.push({
        tag,
        prerelease: version.prerelease.length > 0,
        notes: extractNotes(changelog ?? '', formatVersion(version)),
      });
    }

    return {
      released,
      files: await collectChanges(options.cwd, git, dirty, true),
      entries,
      versions: new Map(),
      emoji: await releaseEmoji(options, existing),
    };
  });
}

function releasedPackage(release: ChangesetsRelease): ReleasedPackage {
  const version = parseVersion(release.newVersion);

  if (!version) {
    throw new RunError(
      `Changesets planned the invalid version "${release.newVersion}" for ${release.name}.`,
    );
  }

  return {
    pkg: release.pkg,
    tag: tagName(release.pkg, release.newVersion),
    version,
  };
}

/** Runs the top-level updaters on the files changesets wrote; every released package counts, tagged or not. */
async function applyChangesetsUpdaters(
  options: RunOptions,
  git: Git,
  plan: ChangesetsPlan,
  dirty: ReadonlySet<string>,
): Promise<void> {
  const contents = new Map<string, FileState>();

  await applyComponentUpdaters(
    options,
    git,
    new Map(
      plan.releases.map(release => [
        packageKey(release.pkg),
        release.newVersion,
      ]),
    ),
    createLoader(options.cwd, contents),
  );

  const updated = changedFiles(contents);

  checkNotDirty(
    updated.map(file => file.path),
    dirty,
    'run the updaters',
  );
  await writeFiles(options.cwd, updated);
}

async function prepareReleaseRequest(
  options: RunOptions,
  git: Git,
  branch: string,
  unit: ReleaseUnit,
  separate: boolean,
  requested: ReleaseAs,
  workspace: Workspace | undefined,
  log: (message: string) => void,
): Promise<ReleaseRequestResult | undefined> {
  const {provider, config} = options;
  const sourceBranch = `${config.branchPrefix}${branch}${separate ? `/${unit.key}` : ''}`;
  const existing = await provider.findOpenReleaseRequest({
    sourceBranch,
    targetBranch: branch,
  });
  const baseSha = await git.head();
  const prepared = workspace
    ? await prepareChangesets(options, git, workspace, existing, log)
    : await prepareConventional(
        options,
        git,
        unit,
        separate,
        requested,
        existing,
        log,
      );

  if (!prepared) {
    await closeObsolete(provider, existing, log);

    return undefined;
  }

  const {files} = prepared;

  log(
    `Release commit changes ${files.length} file(s): ${files.map(file => file.path).join(', ')}.`,
  );

  const {title, message, body} = renderRequest(
    options,
    prepared,
    baseSha,
    existing,
  );

  if (existing?.title === title && existing.body === body) {
    log(`Release request #${existing.id} is up to date: ${existing.url}`);

    return {id: existing.id, url: existing.url, action: 'unchanged'};
  }

  await provider.ensureLabel(labelDefinitions(config).pending);
  await provider.commitFiles({branch: sourceBranch, baseSha, message, files});

  const result = existing
    ? await updateRequest(options, existing, title, body, log)
    : await createRequest(options, branch, sourceBranch, title, body, log);

  if (
    config.aiReleaseNotes.usageComment &&
    prepared.summaries &&
    prepared.summaries.usage.runs > 0
  ) {
    await saveUsageComment(options, result.id, prepared.summaries.usage, log);
  }

  return result;
}

/** Adds this run to the usage comment of the release request; a failure only gets logged. */
async function saveUsageComment(
  options: RunOptions,
  id: number,
  last: UsageTotals,
  log: (message: string) => void,
): Promise<void> {
  const {provider} = options;

  try {
    const comment = await provider.findComment(id, USAGE_MARKER);
    const total = addUsage(
      comment ? parseUsage(comment.body) : undefined,
      last,
    );

    await provider.saveComment(id, renderUsage(total, last), comment?.id);
    log(`Updated the AI usage comment of release request #${id}.`);
  } catch (error) {
    log(
      `Could not update the AI usage comment of release request #${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function createRequest(
  options: RunOptions,
  branch: string,
  sourceBranch: string,
  title: string,
  body: string,
  log: (message: string) => void,
): Promise<ReleaseRequestResult> {
  const {config} = options;
  const created = await options.provider.createReleaseRequest({
    sourceBranch,
    targetBranch: branch,
    title,
    body,
    labels: [config.labels.pending],
    draft: config.draft,
    assignees: config.assignees,
    reviewers: config.reviewers,
  });

  log(`Created release request #${created.id}: ${created.url}`);

  return {id: created.id, url: created.url, action: 'created'};
}

/** Closes the release request that is still open although there is nothing to release. */
async function closeObsolete(
  provider: Provider,
  existing: ReleaseRequest | null,
  log: (message: string) => void,
): Promise<void> {
  if (existing) {
    await provider.closeReleaseRequest(existing.id);
    log(
      `Closed release request #${existing.id} because there is nothing to release anymore.`,
    );
  }
}

/** Number of the latest releases whose emojis are not reused. */
const EMOJI_HISTORY = 60;

/**
 * The emoji of the release: kept from the (possibly edited) release title, otherwise random if enabled and different
 * from the emojis of the latest releases.
 */
async function releaseEmoji(
  options: RunOptions,
  existing: ReleaseRequest | null,
): Promise<string> {
  const {config, provider} = options;
  const title = existing ? parseDetails(existing.body).title : undefined;

  if (title !== undefined) {
    return leadingEmoji(title);
  }

  if (!config.releaseEmoji) {
    return '';
  }

  const merged = [config.labels.tagged, config.labels.pending].map(label =>
    provider.listMergedReleaseRequests({
      targetBranch: options.currentBranch,
      label,
    }),
  );
  const recent = (await Promise.all(merged))
    .flat()
    .map(request => leadingEmoji(parseDetails(request.body).title ?? ''))
    .filter(emoji => emoji !== '')
    .slice(-EMOJI_HISTORY);

  return randomEmoji(options.random, recent);
}

function renderRequest(
  options: RunOptions,
  prepared: PreparedRelease,
  baseSha: string,
  existing: ReleaseRequest | null,
): {title: string; message: string; body: string} {
  const {config} = options;
  const {released: plans, entries, versions, emoji, summaries} = prepared;
  const unique = plans.filter(
    (plan, index) => plans.findIndex(other => other.tag === plan.tag) === index,
  );
  const tags = unique.map(plan => plan.tag);
  const planVersions = unique.map(plan => formatVersion(plan.version));
  const title = renderTitle(tags, config.pullRequestTitle, planVersions);
  const message = config.releaseCommitMessage
    ? renderTitle(tags, config.releaseCommitMessage, planVersions)
    : title;
  const overrides: Array<BodyOverride> = plans.flatMap(plan => {
    const version = versions.get(componentKey(plan.pkg));

    return version
      ? [{component: componentKey(plan.pkg), version: formatVersion(version)}]
      : [];
  });
  const previous = existing ? parseDetails(existing.body) : {};
  const body = renderBody(entries, baseSha, overrides, {
    template: config.pullRequestBody,
    versions: planVersions,
    summaries: summaries?.stored,
    summaryWarnings: summaries?.warnings,
    details: {
      title:
        previous.title ??
        (emoji ? `${emoji} ${config.releaseName}` : config.releaseName),
      text: previous.text ?? DEFAULT_RELEASE_TEXT,
    },
  });

  return {title, message, body};
}

async function updateRequest(
  options: RunOptions,
  existing: ReleaseRequest,
  title: string,
  body: string,
  log: (message: string) => void,
): Promise<ReleaseRequestResult> {
  const {provider, config} = options;

  await provider.updateReleaseRequest(existing.id, {
    title,
    body,
    draft: existing.draft,
  });

  if (!existing.labels.includes(config.labels.pending)) {
    await provider.setLabels(existing.id, {
      add: [config.labels.pending],
      remove: [],
    });
  }

  log(`Updated release request #${existing.id}: ${existing.url}`);

  return {id: existing.id, url: existing.url, action: 'updated'};
}
