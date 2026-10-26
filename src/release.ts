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
import type {FileChange, Provider} from './providers/types.js';
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
    `Release branch "${branch}" on ${options.provider.name}; ${options.config.packages.length === 1 ? '1 package' : `${options.config.packages.length} packages`}: ${options.config.packages.map(packageKey).join(', ')}.`,
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

  log(
    `Done: ${tagged.length === 0 ? 'nothing tagged' : `tagged ${tagged.join(', ')}`}; ` +
      (releaseRequests.length === 0
        ? 'no release request open.'
        : `${releaseRequests.map(request => `#${request.id} ${request.action}`).join(', ')}.`),
  );

  return {tagged, releaseRequests};
}

async function tagMergedReleases(
  options: RunOptions,
  git: Git,
  branch: string,
  log: (message: string) => void,
): Promise<Array<string>> {
  const {provider} = options;
  const merged = await provider.listMergedReleaseRequests({
    targetBranch: branch,
    label: options.config.labels.pending,
  });
  const {config} = options;
  const labels = labelDefinitions(config);
  const created: Array<string> = [];

  log(
    merged.length === 0
      ? `No merged release requests labelled "${config.labels.pending}".`
      : `Found ${merged.length} merged release request(s) labelled "${config.labels.pending}".`,
  );

  for (const request of merged) {
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
      continue;
    }

    await provider.ensureLabel(labels.tagged);

    const details = parseDetails(request.body);
    const intro = releaseText(details.text ?? '');

    for (const entry of entries) {
      const result = await provider.createTag(entry.tag, request.mergeSha);

      log(
        result === 'created'
          ? `Created tag ${entry.tag}.`
          : `Tag ${entry.tag} already exists.`,
      );

      if (!(await git.hasTag(entry.tag))) {
        await git.createLightweightTag(entry.tag, request.mergeSha);
      }

      if (await provider.releaseExists(entry.tag)) {
        log(`Release ${entry.tag} already exists.`);
      } else {
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

      created.push(entry.tag);
    }

    await provider.setLabels(request.id, {
      add: [config.labels.tagged],
      remove: [config.labels.pending],
    });
  }

  return created;
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
    for (const file of files) {
      const target = path.join(options.cwd, file.path);

      await mkdir(path.dirname(target), {recursive: true});
      await writeFile(target, file.content);
    }

    options.log?.(`Running pre-commit-script ${script}.`);

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

    const changed = (await git.status()).filter(
      entry => !dirty.has(entry.path),
    );

    const result: Array<FileChange> = [];

    for (const entry of changed) {
      if (entry.deleted) {
        throw new RunError(
          `The pre-commit-script deleted or renamed "${entry.path}", which a release commit cannot express.`,
        );
      }

      result.push({
        path: entry.path,
        content: await readFile(path.join(options.cwd, entry.path), 'utf8'),
        exists: entry.tracked,
      });
    }

    return result;
  } finally {
    const leftovers = (await git.status()).filter(
      entry => !dirty.has(entry.path),
    );

    await git.discard(leftovers);
  }
}

async function buildFiles(
  options: RunOptions,
  git: Git,
  plans: Array<PackagePlan>,
): Promise<{files: Array<FileChange>; entries: Array<BodyEntry>}> {
  const contents = new Map<
    string,
    {original: string | undefined; current: string}
  >();

  const load = async (
    repoPath: string,
    required: boolean,
  ): Promise<{original: string | undefined; current: string}> => {
    const known = contents.get(repoPath);

    if (known) {
      return known;
    }

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
  const notesByTag = new Map<
    string,
    Array<{pkg: PackageConfig; notes: string}>
  >();

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

    for (const updater of pkg.updaters) {
      for (const file of await expandPath(git, updater.path)) {
        const target = await load(file, true);

        target.current = applyUpdater(
          updater.type,
          target.current,
          version,
          file,
          updater.key,
        );

        if (!updater.lockfiles) {
          continue;
        }

        for (const companion of companions(
          updater.type,
          file,
          target.current,
        )) {
          const lock = await load(companion.path, false);

          if (lock.original !== undefined) {
            lock.current = companion.update(lock.current, version);
          }
        }
      }
    }
  }

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

  return {files: await applyPreCommitScript(options, git, files), entries};
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

/** Plans the packages of a linked group: all of them get the highest version any member needs. */
async function planGroup(
  git: Git,
  config: Config,
  group: ReadonlyArray<PackageConfig>,
  versions: Map<string, Version>,
  log: (message: string) => void,
): Promise<Array<PackagePlan>> {
  const settings = planSettings(config);
  const tagsOf =
    config.linkedTags === 'single'
      ? group.find(
          pkg => pkg.path === tagPackagePath(group.map(member => member.path)),
        )
      : undefined;
  const own = [];

  for (const pkg of group) {
    own.push(
      await planPackage(
        git,
        pkg,
        config.packages,
        {releaseAs: versions.get(componentKey(pkg)), tagsOf, log},
        settings,
      ),
    );
  }

  const changed = own.flatMap(plan => plan ?? []);

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

  for (const pkg of group) {
    const plan = await planPackage(
      git,
      pkg,
      config.packages,
      {minLevel: level, force: true, tagsOf},
      settings,
    );

    if (plan) {
      candidates.push(plan.version);
    }
  }

  const [first, ...others] = candidates;

  if (!first) {
    return [];
  }

  const shared = others.reduce(
    (highest, version) =>
      compareVersions(version, highest) > 0 ? version : highest,
    first,
  );
  const plans: Array<PackagePlan> = [];

  for (const pkg of group) {
    const plan = await planPackage(
      git,
      pkg,
      config.packages,
      {releaseAs: shared, force: true, tagsOf},
      settings,
    );

    if (plan) {
      plans.push(plan);
    }
  }

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
  const labels = labelDefinitions(config);
  const sourceBranch = `${config.branchPrefix}${branch}${separate ? `/${unit.key}` : ''}`;
  const existing = await provider.findOpenReleaseRequest({
    sourceBranch,
    targetBranch: branch,
  });

  const versions = effectiveRequests(unit.packages, existing?.body, requested);
  const plans = await planUnit(git, config, unit, versions, log);

  if (plans.length === 0) {
    log(
      `No releasable changes found${separate ? ` for ${unit.key}` : ''} (see "patch-types" and "minor-types"; breaking commits always release).`,
    );

    if (existing) {
      await provider.closeReleaseRequest(existing.id);
      log(
        `Closed release request #${existing.id} because there is nothing to release anymore.`,
      );
    }

    return undefined;
  }

  const baseSha = await git.head();
  const {files, entries} = await buildFiles(options, git, plans);

  log(
    `Release commit changes ${files.length} file(s): ${files.map(file => file.path).join(', ')}.`,
  );
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

  if (existing?.title === title && existing.body === body) {
    log(`Release request #${existing.id} is up to date: ${existing.url}`);

    return {id: existing.id, url: existing.url, action: 'unchanged'};
  }

  await provider.ensureLabel(labels.pending);
  await provider.commitFiles({branch: sourceBranch, baseSha, message, files});

  if (existing) {
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

  const created = await provider.createReleaseRequest({
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
