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
  commits: ConventionalCommit[];
  /** Bump level derived from the commits; `null` if only a requested or linked version applies. */
  level: BumpLevel | null;
  /** No commit touched the package since the last release (it only follows the version of linked packages). */
  empty: boolean;
  /** Reverted commits and their reverts, left out of the changelog. */
  revertedCommits: string[];
}

/** Other packages located inside `pkg`, whose changes must not count for `pkg`. */
export function nestedPackagePaths(
  pkg: PackageConfig,
  all: readonly PackageConfig[],
): string[] {
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
  excludePaths: readonly string[];
  /** Start of the history for packages without a tag. */
  bootstrapSha?: string | undefined;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  bumpRules: DEFAULT_BUMP_RULES,
  excludePaths: [],
};

export function pathspecsFor(
  pkg: PackageConfig,
  all: readonly PackageConfig[],
  excludePaths: readonly string[] = [],
): string[] {
  return [
    pkg.path,
    ...nestedPackagePaths(pkg, all).map(nested => `:(exclude)${nested}`),
    ...excludePaths.map(pattern => `:(exclude,glob)${pattern}`),
  ];
}

async function conventionalCommits(
  git: Git,
  range: string | undefined,
  pathspecs: string[],
): Promise<ConventionalCommit[]> {
  const raw = withoutReverted(await git.log(range, pathspecs));

  return raw.flatMap(commit => parseCommit(commit.sha, commit.message) ?? []);
}

export interface PlanOptions {
  releaseAs?: Version | undefined;
  /** Raises the bump level, used for packages that share their version with a changed one. */
  minLevel?: BumpLevel | null | undefined;
  /** Release even without any change in the package (linked packages). */
  force?: boolean | undefined;
  /** Package whose tags are used instead of the package's own (single tag of a linked group). */
  tagsOf?: PackageConfig | undefined;
}

const LEVELS: readonly BumpLevel[] = ['patch', 'minor', 'major'];

export function maxLevel(
  a: BumpLevel | null | undefined,
  b: BumpLevel | null | undefined,
): BumpLevel | null {
  const rank = (level: BumpLevel | null | undefined): number =>
    level ? LEVELS.indexOf(level) : -1;

  return (rank(a) >= rank(b) ? a : b) ?? null;
}

export async function planPackage(
  git: Git,
  pkg: PackageConfig,
  all: readonly PackageConfig[],
  options: PlanOptions = {},
  settings: PlanSettings = DEFAULT_PLAN_SETTINGS,
): Promise<PackagePlan | null> {
  const {releaseAs, force = false} = options;
  const tagged = options.tagsOf ?? pkg;
  const releaseTags = findReleaseTags(await git.tagsMergedIntoHead(), tagged);
  const lastAny = highest(releaseTags);
  const lastStable = highestStable(releaseTags);
  const pathspecs = pathspecsFor(pkg, all, settings.excludePaths);
  const bootstrap = settings.bootstrapSha && `${settings.bootstrapSha}..HEAD`;

  const sinceStable = await conventionalCommits(
    git,
    (lastStable && `${lastStable.tag}..HEAD`) ?? bootstrap,
    pathspecs,
  );
  const level = maxLevel(
    bumpLevel(sinceStable, settings.bumpRules),
    options.minLevel,
  );

  const lastIsPrerelease =
    lastAny !== undefined && isPrerelease(lastAny.version);
  const rangeStart = pkg.prerelease ? lastAny : lastStable;
  const range = (rangeStart && `${rangeStart.tag}..HEAD`) ?? bootstrap;

  if (releaseAs && level === null && !force) {
    // A requested version needs at least one change to release, but not necessarily a releasable one.
    if ((await git.log(range, pathspecs)).length === 0) {
      return null;
    }
  }

  if (!releaseAs && !force && pkg.prerelease && lastIsPrerelease) {
    // Don't publish another pre-release unless something releasable happened since the last one.
    const sinceLast = await conventionalCommits(
      git,
      `${lastAny.tag}..HEAD`,
      pathspecs,
    );

    if (bumpLevel(sinceLast, settings.bumpRules) === null) {
      return null;
    }
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
    return null;
  }

  if (releaseAs && lastAny && compareVersions(version, lastAny.version) <= 0) {
    throw new ReleaseAsError(
      `Requested version ${formatVersion(version)} is not greater than the latest version ${formatVersion(lastAny.version)}` +
        ' (run relwolf with RELWOLF_RELEASE_AS=auto to remove the request).',
    );
  }

  const touching = await git.log(range, pathspecs);

  return {
    pkg,
    version,
    tag: tagName(tagged, formatVersion(version)),
    prerelease: isPrerelease(version),
    range,
    tagPattern: tagPattern(tagged, Boolean(pkg.prerelease)),
    level,
    empty: touching.length === 0,
    commits: sinceStable,
    revertedCommits: splitReverted(touching).dropped.map(commit => commit.sha),
  };
}
