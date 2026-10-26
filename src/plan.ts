import {
  bumpLevel,
  DEFAULT_BUMP_RULES,
  parseCommit,
  splitReverted,
  withoutReverted,
  type BumpRules,
  type ConventionalCommit,
} from './commits.js';
import type {PackageConfig} from './config.js';
import type {Git} from './git.js';
import {ReleaseAsError} from './release-as.js';
import {
  findReleaseTags,
  highest,
  highestStable,
  tagName,
  tagPattern,
  type ReleaseTag,
} from './tags.js';
import {
  compareVersions,
  formatVersion,
  isPrerelease,
  nextVersion,
  type BumpLevel,
  type Version,
} from './version.js';

export interface PackagePlan {
  pkg: PackageConfig;
  version: Version;
  tag: string;
  prerelease: boolean;
  /** Revision range for the changelog; whole history if undefined. */
  range?: string | undefined;
  tagPattern: string;
  commits: Array<ConventionalCommit>;
  /** Bump level derived from the commits; `null` if only a requested or linked version applies. */
  level: BumpLevel | null;
  /** No commit touched the package since the last release (it only follows the version of linked packages). */
  empty: boolean;
  /** Reverted commits and their reverts, left out of the changelog. */
  revertedCommits: Array<string>;
}

/** Other packages located inside `pkg`, whose changes must not count for `pkg`. */
export function nestedPackagePaths(
  pkg: PackageConfig,
  all: ReadonlyArray<PackageConfig>,
): Array<string> {
  return all
    .filter(
      other =>
        other.path !== pkg.path &&
        (pkg.path === '.' || other.path.startsWith(`${pkg.path}/`)),
    )
    .map(other => other.path);
}

/** Global settings that influence how commits are counted. */
export interface PlanSettings {
  bumpRules: BumpRules;
  /** Globs relative to the repository root, whose changes never count. */
  excludePaths: ReadonlyArray<string>;
  /** Start of the history for packages without a tag. */
  bootstrapSha?: string | undefined;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  bumpRules: DEFAULT_BUMP_RULES,
  excludePaths: [],
};

export function pathspecsFor(
  pkg: PackageConfig,
  all: ReadonlyArray<PackageConfig>,
  excludePaths: ReadonlyArray<string> = [],
): Array<string> {
  return [
    pkg.path,
    ...nestedPackagePaths(pkg, all).map(nested => `:(exclude)${nested}`),
    ...excludePaths.map(pattern => `:(exclude,glob)${pattern}`),
  ];
}

interface AnalysedCommits {
  commits: Array<ConventionalCommit>;
  /** Commits in the range, before reverts and non-conventional messages were removed. */
  total: number;
  reverted: number;
}

async function analyseCommits(
  git: Git,
  range: string | undefined,
  pathspecs: Array<string>,
): Promise<AnalysedCommits> {
  const all = await git.log(range, pathspecs);
  const kept = withoutReverted(all);

  return {
    commits: kept.flatMap(
      commit => parseCommit(commit.sha, commit.message) ?? [],
    ),
    total: all.length,
    reverted: all.length - kept.length,
  };
}

async function conventionalCommits(
  git: Git,
  range: string | undefined,
  pathspecs: Array<string>,
): Promise<Array<ConventionalCommit>> {
  return (await analyseCommits(git, range, pathspecs)).commits;
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** E.g. "2 feat, 1 fix, 3 chore"; breaking commits are counted separately by the caller. */
function countTypes(commits: ReadonlyArray<ConventionalCommit>): string {
  const counts = new Map<string, number>();

  for (const commit of commits) {
    counts.set(commit.type, (counts.get(commit.type) ?? 0) + 1);
  }

  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
}

function describeLevel(
  commits: ReadonlyArray<ConventionalCommit>,
  rules: BumpRules,
  level: BumpLevel,
): string {
  if (level === 'major') {
    const breaking = commits.filter(commit => commit.breaking);

    return `Found ${plural(breaking.length, 'breaking change')}`;
  }

  const types = level === 'minor' ? rules.minor : rules.patch;
  const matching = commits.filter(commit => types.includes(commit.type));

  return `Found ${countTypes(matching)} ${matching.length === 1 ? 'commit' : 'commits'}`;
}

export interface PlanOptions {
  releaseAs?: Version | undefined;
  /** Raises the bump level, used for packages that share their version with a changed one. */
  minLevel?: BumpLevel | null | undefined;
  /** Release even without any change in the package (linked packages). */
  force?: boolean | undefined;
  /** Package whose tags are used instead of the package's own (single tag of a linked group). */
  tagsOf?: PackageConfig | undefined;
  /** Explains how the version was determined; only the call that decides should pass it. */
  log?: ((message: string) => void) | undefined;
}

const LEVELS: ReadonlyArray<BumpLevel> = ['patch', 'minor', 'major'];

export function maxLevel(
  a: BumpLevel | null | undefined,
  b: BumpLevel | null | undefined,
): BumpLevel | null {
  const rank = (level: BumpLevel | null | undefined): number =>
    level ? LEVELS.indexOf(level) : -1;

  return (rank(a) >= rank(b) ? a : b) ?? null;
}

type Log = ((message: string) => void) | undefined;

function logHistory(
  log: (message: string) => void,
  lastStable: ReleaseTag | undefined,
  settings: PlanSettings,
  analysed: AnalysedCommits,
): void {
  log(
    lastStable
      ? `Last stable release: ${lastStable.tag}.`
      : `No previous release tag found${settings.bootstrapSha ? `, counting from bootstrap-sha ${settings.bootstrapSha}` : ', counting the whole history'}.`,
  );

  const unparsed = analysed.total - analysed.reverted - analysed.commits.length;
  const notes = [
    ...(unparsed > 0 ? [`${unparsed} not following Conventional Commits`] : []),
    ...(analysed.reverted > 0
      ? [`${plural(analysed.reverted, 'reverted commit')} ignored`]
      : []),
  ];

  log(
    analysed.total === 0
      ? 'No commits touch this package since then.'
      : `Analysed ${plural(analysed.total, 'commit')}: ${countTypes(analysed.commits) || 'none follow Conventional Commits'}${notes.map(note => `; ${note}`).join('')}.`,
  );
}

function logBump(
  log: (message: string) => void,
  pkg: PackageConfig,
  lastStable: ReleaseTag | undefined,
  version: Version,
  level: BumpLevel,
  describe: string,
  tag: string,
): void {
  const demoted =
    level === 'major' && version.major === lastStable?.version.major
      ? ' (breaking changes only bump minor before 1.0.0, see bump-minor-pre-major)'
      : '';
  const bump =
    lastStable && !pkg.prerelease
      ? `${level}${demoted}`
      : lastStable
        ? `${level}${demoted}, pre-release "${pkg.prerelease}"`
        : level;

  log(
    `${describe}, bumping ${bump}: ${lastStable?.tag ?? 'no release'} -> ${tag}`,
  );
}

function logNoRelease(
  log: Log,
  lastStable: ReleaseTag | undefined,
  rules: BumpRules,
): void {
  log?.(
    `No releasable commits since ${lastStable?.tag ?? 'the start of the history'}. ` +
      `Releasable types: ${[...rules.minor.map(type => `${type} (minor)`), ...rules.patch.map(type => `${type} (patch)`)].join(', ')}; breaking changes always release.`,
  );
}

interface PlanContext {
  git: Git;
  pkg: PackageConfig;
  options: PlanOptions;
  settings: PlanSettings;
  log: Log;
  tagged: PackageConfig;
  pathspecs: Array<string>;
  lastAny: ReleaseTag | undefined;
  lastStable: ReleaseTag | undefined;
  commits: Array<ConventionalCommit>;
  level: BumpLevel | null;
  range: string | undefined;
}

/** Prefixes messages with the package when several packages are planned. */
function prefixedLog(
  pkg: PackageConfig,
  all: ReadonlyArray<PackageConfig>,
  log: Log,
): Log {
  const prefix = all.length > 1 ? `[${pkg.component ?? pkg.path}] ` : '';

  return (
    log &&
    ((message: string) => {
      log(prefix + message);
    })
  );
}

async function gatherContext(
  git: Git,
  pkg: PackageConfig,
  all: ReadonlyArray<PackageConfig>,
  options: PlanOptions,
  settings: PlanSettings,
): Promise<PlanContext> {
  const log = prefixedLog(pkg, all, options.log);
  const tagged = options.tagsOf ?? pkg;
  const releaseTags = findReleaseTags(await git.tagsMergedIntoHead(), tagged);
  const lastAny = highest(releaseTags);
  const lastStable = highestStable(releaseTags);
  const pathspecs = pathspecsFor(pkg, all, settings.excludePaths);
  const bootstrap = settings.bootstrapSha && `${settings.bootstrapSha}..HEAD`;
  const analysed = await analyseCommits(
    git,
    (lastStable && `${lastStable.tag}..HEAD`) ?? bootstrap,
    pathspecs,
  );

  if (log) {
    logHistory(log, lastStable, settings, analysed);
  }

  const rangeStart = pkg.prerelease ? lastAny : lastStable;

  return {
    git,
    pkg,
    options,
    settings,
    log,
    tagged,
    pathspecs,
    lastAny,
    lastStable,
    commits: analysed.commits,
    level: maxLevel(
      bumpLevel(analysed.commits, settings.bumpRules),
      options.minLevel,
    ),
    range: (rangeStart && `${rangeStart.tag}..HEAD`) ?? bootstrap,
  };
}

/** A requested version needs at least one change to release, but not necessarily a releasable one. */
async function requestWithoutChanges(context: PlanContext): Promise<boolean> {
  const {git, options, log, pathspecs, range, level} = context;

  if (
    !options.releaseAs ||
    level !== null ||
    options.force ||
    (await git.log(range, pathspecs)).length > 0
  ) {
    return false;
  }

  log?.('A version was requested, but nothing changed since the last release.');

  return true;
}

/** Don't publish another pre-release unless something releasable happened since the last one. */
async function repeatsPrerelease(context: PlanContext): Promise<boolean> {
  const {git, pkg, options, settings, log, pathspecs, lastAny} = context;

  if (
    options.releaseAs ||
    options.force ||
    !pkg.prerelease ||
    !lastAny ||
    !isPrerelease(lastAny.version)
  ) {
    return false;
  }

  const sinceLast = await conventionalCommits(
    git,
    `${lastAny.tag}..HEAD`,
    pathspecs,
  );

  if (bumpLevel(sinceLast, settings.bumpRules) !== null) {
    return false;
  }

  log?.(
    `No releasable commits since the last pre-release ${lastAny.tag}; not publishing another one.`,
  );

  return true;
}

/** The version to release, or `null` (with an explanation in the log) if there is nothing to release. */
async function decideVersion(context: PlanContext): Promise<Version | null> {
  const {pkg, options, settings, log, lastAny, lastStable, level} = context;
  const {releaseAs} = options;

  if (
    (await requestWithoutChanges(context)) ||
    (await repeatsPrerelease(context))
  ) {
    return null;
  }

  const version = nextVersion({
    lastStable: lastStable?.version,
    lastAny: lastAny?.version,
    level,
    prerelease: pkg.prerelease,
    minorPreMajor: pkg.minorPreMajor,
    initialVersion: pkg.initialVersion,
    releaseAs,
  });

  if (!version) {
    logNoRelease(log, lastStable, settings.bumpRules);

    return null;
  }

  if (releaseAs && lastAny && compareVersions(version, lastAny.version) <= 0) {
    throw new ReleaseAsError(
      `Requested version ${formatVersion(version)} is not greater than the latest version ${formatVersion(lastAny.version)}` +
        ' (run relwolf with RELWOLF_RELEASE_AS=auto to remove the request).',
    );
  }

  return version;
}

async function buildPlan(
  context: PlanContext,
  version: Version,
): Promise<PackagePlan> {
  const {git, pkg, options, settings, log, tagged, pathspecs} = context;
  const {lastStable, commits, level, range} = context;
  const touching = await git.log(range, pathspecs);
  const tag = tagName(tagged, formatVersion(version));

  if (log && !options.releaseAs && level) {
    const describe = describeLevel(commits, settings.bumpRules, level);

    logBump(log, pkg, lastStable, version, level, describe, tag);
  }

  return {
    pkg,
    version,
    tag,
    prerelease: isPrerelease(version),
    range,
    tagPattern: tagPattern(tagged, Boolean(pkg.prerelease)),
    level,
    empty: touching.length === 0,
    commits,
    revertedCommits: splitReverted(touching).dropped.map(commit => commit.sha),
  };
}

export async function planPackage(
  git: Git,
  pkg: PackageConfig,
  all: ReadonlyArray<PackageConfig>,
  options: PlanOptions = {},
  settings: PlanSettings = DEFAULT_PLAN_SETTINGS,
): Promise<PackagePlan | null> {
  const context = await gatherContext(git, pkg, all, options, settings);
  const version = await decideVersion(context);

  return version ? buildPlan(context, version) : null;
}
