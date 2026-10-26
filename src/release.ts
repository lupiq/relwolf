import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_RELEASE_TEXT,
  parseBody,
  parseDetails,
  parseOverrides,
  releaseText,
  renderBody,
  renderReleaseName,
  renderTitle,
  type BodyEntry,
  type BodyOverride,
} from './body.js';
import {
  generateNotes,
  prependToChangelog,
  type CliffInvocation,
} from './changelog.js';
import {
  ROOT_KEY,
  tagPackagePath,
  type Config,
  type PackageConfig,
} from './config.js';
import {randomEmoji} from './emoji.js';
import {CommandError, Git, run as runCommand} from './git.js';
import {
  maxLevel,
  nestedPackagePaths,
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
import {isValidReleaseTag, parseReleaseTag} from './tags.js';
import {applyUpdater, companions} from './updaters/index.js';
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
    created.push(...(await tagMergedRequest(options, git, request, log)));
  }

  return created;
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
  const created: Array<string> = [];

  for (const entry of entries) {
    await tagAndRelease(
      options,
      git,
      entry,
      request.mergeSha,
      details,
      intro,
      log,
    );
    created.push(entry.tag);
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
): Promise<void> {
  const {provider, config} = options;
  const result = await provider.createTag(entry.tag, mergeSha);

  log(
    result === 'created'
      ? `Created tag ${entry.tag}.`
      : `Tag ${entry.tag} already exists.`,
  );

  if (!(await git.hasTag(entry.tag))) {
    await git.createLightweightTag(entry.tag, mergeSha);
  }

  if (await provider.releaseExists(entry.tag)) {
    log(`Release ${entry.tag} already exists.`);

    return;
  }

  const parsed = parseReleaseTag(entry.tag, config.packages);

  await provider.createRelease({
    tag: entry.tag,
    name: renderReleaseName(details.title ?? config.releaseName, {
      tag: entry.tag,
      version: parsed ? formatVersion(parsed.version) : entry.tag,
      component: parsed?.pkg.component,
    }),
    body: intro ? `${intro}\n\n${entry.notes}` : entry.notes,
    prerelease: entry.prerelease,
  });
  log(`Created release ${entry.tag}.`);
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
 * Writes the release files into the working tree, runs `pre-commit-script` and returns everything that changed
 * (the script may touch or add any file). The working tree is reset afterwards.
 */
async function applyPreCommitScript(
  options: RunOptions,
  git: Git,
  files: Array<FileChange>,
): Promise<Array<FileChange>> {
  const script = options.config.preCommitScript;

  if (!script) {
    return files;
  }

  const scriptPath = path.join(options.cwd, script);

  if (!(await stat(scriptPath).catch(() => undefined))?.isFile()) {
    throw new RunError(
      `The pre-commit-script "${script}" configured in relwolf.yaml does not exist.`,
    );
  }

  const dirty = new Set((await git.status()).map(entry => entry.path));
  const clobbered = files.filter(file => dirty.has(file.path));

  if (clobbered.length > 0) {
    throw new RunError(
      `Cannot run the pre-commit-script: ${clobbered.map(file => file.path).join(', ')} has uncommitted changes in the working tree. Run relwolf on a clean checkout.`,
    );
  }

  try {
    await writeFiles(options.cwd, files);
    options.log?.(`Running pre-commit-script ${script}.`);
    await runPreCommitScript(options, script, scriptPath);

    return await collectChanges(options.cwd, git, dirty);
  } finally {
    const leftovers = (await git.status()).filter(
      entry => !dirty.has(entry.path),
    );

    await git.discard(leftovers);
  }
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

async function runPreCommitScript(
  options: RunOptions,
  script: string,
  scriptPath: string,
): Promise<void> {
  try {
    await runCommand(scriptPath, [], options.cwd, options.env);
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

/** Files changed by the script, excluding those that were already dirty before. */
async function collectChanges(
  cwd: string,
  git: Git,
  dirty: ReadonlySet<string>,
): Promise<Array<FileChange>> {
  const changed = (await git.status()).filter(entry => !dirty.has(entry.path));
  const result: Array<FileChange> = [];

  for (const entry of changed) {
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
): Promise<{files: Array<FileChange>; entries: Array<BodyEntry>}> {
  const contents = new Map<string, FileState>();
  const load = createLoader(options.cwd, contents);
  const notesByTag: NotesByTag = new Map();

  for (const plan of plans) {
    await applyPlan(options, git, plan, load, notesByTag);
  }

  const entries = buildEntries(notesByTag, plans);
  const files = changedFiles(contents);

  return {files: await applyPreCommitScript(options, git, files), entries};
}

/** Generates the notes of a plan, prepends them to the changelog and runs the updaters. */
async function applyPlan(
  options: RunOptions,
  git: Git,
  plan: PackagePlan,
  load: FileLoader,
  notesByTag: NotesByTag,
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
  const env = options.env ?? process.env;

  const placeholder = plan.empty ? options.config.noChangesText : '';
  const notes = placeholder || (await generateNotes(cliff, env));

  const sections = notesByTag.get(plan.tag) ?? [];

  sections.push({pkg, notes});
  notesByTag.set(plan.tag, sections);

  const changelog = await load(pkg.changelogPath, false);

  changelog.current = await prependToChangelog(
    cliff,
    changelog.current,
    env,
    placeholder,
  );

  const version = formatVersion(plan.version);

  for (const updater of pkg.updaters) {
    for (const file of await expandPath(git, updater.path)) {
      await updateFile(updater, file, version, load);
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

async function prepareReleaseRequest(
  options: RunOptions,
  git: Git,
  branch: string,
  unit: ReleaseUnit,
  separate: boolean,
  requested: ReleaseAs,
  log: (message: string) => void,
): Promise<ReleaseRequestResult | undefined> {
  const {provider, config} = options;
  const sourceBranch = `${config.branchPrefix}${branch}${separate ? `/${unit.key}` : ''}`;
  const existing = await provider.findOpenReleaseRequest({
    sourceBranch,
    targetBranch: branch,
  });

  const versions = effectiveRequests(unit.packages, existing?.body, requested);
  const plans = await planUnit(git, config, unit, versions, log);

  if (plans.length === 0) {
    await closeObsolete(
      provider,
      existing,
      separate ? unit.key : undefined,
      log,
    );

    return undefined;
  }

  const baseSha = await git.head();
  const {files, entries} = await buildFiles(options, git, plans);

  log(
    `Release commit changes ${files.length} file(s): ${files.map(file => file.path).join(', ')}.`,
  );

  const {title, message, body} = renderRequest(
    options,
    plans,
    entries,
    versions,
    baseSha,
    existing,
  );

  if (existing?.title === title && existing.body === body) {
    log(`Release request #${existing.id} is up to date: ${existing.url}`);

    return {id: existing.id, url: existing.url, action: 'unchanged'};
  }

  await provider.ensureLabel(labelDefinitions(config).pending);
  await provider.commitFiles({branch: sourceBranch, baseSha, message, files});

  if (existing) {
    return updateRequest(options, existing, title, body, log);
  }

  return createRequest(options, branch, sourceBranch, title, body, log);
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

/** Logs that there is nothing to release and closes the release request that is still open. */
async function closeObsolete(
  provider: Provider,
  existing: ReleaseRequest | null,
  unitKey: string | undefined,
  log: (message: string) => void,
): Promise<void> {
  log(
    `No releasable changes found${unitKey === undefined ? '' : ` for ${unitKey}`} (see "patch-types" and "minor-types"; breaking commits always release).`,
  );

  if (existing) {
    await provider.closeReleaseRequest(existing.id);
    log(
      `Closed release request #${existing.id} because there is nothing to release anymore.`,
    );
  }
}

function renderRequest(
  options: RunOptions,
  plans: Array<PackagePlan>,
  entries: Array<BodyEntry>,
  versions: Map<string, Version>,
  baseSha: string,
  existing: ReleaseRequest | null,
): {title: string; message: string; body: string} {
  const {config} = options;
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
    details: {
      title:
        previous.title ??
        (config.releaseEmoji
          ? `${randomEmoji(options.random)} ${config.releaseName}`
          : config.releaseName),
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
