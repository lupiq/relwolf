import {bumpLevel, parseCommit, type ConventionalCommit} from './commits.js';
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

export function pathspecsFor(
  pkg: PackageConfig,
  all: readonly PackageConfig[],
): string[] {
  return [
    pkg.path,
    ...nestedPackagePaths(pkg, all).map(nested => `:(exclude)${nested}`),
  ];
}

async function conventionalCommits(
  git: Git,
  range: string | undefined,
  pathspecs: string[],
): Promise<ConventionalCommit[]> {
  const raw = await git.log(range, pathspecs);
  return raw.flatMap(commit => parseCommit(commit.sha, commit.message) ?? []);
}

export async function planPackage(
  git: Git,
  pkg: PackageConfig,
  all: readonly PackageConfig[],
  releaseAs?: Version,
): Promise<PackagePlan | null> {
  const releaseTags = findReleaseTags(
    await git.tagsMergedIntoHead(),
    pkg.component,
  );
  const lastAny = highest(releaseTags);
  const lastStable = highestStable(releaseTags);
  const pathspecs = pathspecsFor(pkg, all);

  const sinceStable = await conventionalCommits(
    git,
    lastStable && `${lastStable.tag}..HEAD`,
    pathspecs,
  );
  const level = bumpLevel(sinceStable);

  const lastIsPrerelease =
    lastAny !== undefined && isPrerelease(lastAny.version);
  const rangeStart = pkg.prerelease ? lastAny : lastStable;
  const range = rangeStart && `${rangeStart.tag}..HEAD`;

  if (releaseAs && level === null) {
    // A requested version needs at least one change to release, but not necessarily a releasable one.
    if ((await git.log(range, pathspecs)).length === 0) return null;
  }

  if (!releaseAs && pkg.prerelease && lastIsPrerelease) {
    // Don't publish another pre-release unless something releasable happened since the last one.
    const sinceLast = await conventionalCommits(
      git,
      `${lastAny.tag}..HEAD`,
      pathspecs,
    );
    if (bumpLevel(sinceLast) === null) return null;
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
  if (!version) return null;

  if (releaseAs && lastAny && compareVersions(version, lastAny.version) <= 0) {
    throw new ReleaseAsError(
      `Requested version ${formatVersion(version)} is not greater than the latest version ${formatVersion(lastAny.version)}` +
        ' (run relwolf with RELWOLF_RELEASE_AS=auto to remove the request).',
    );
  }

  return {
    pkg,
    version,
    tag: tagName(pkg.component, formatVersion(version)),
    prerelease: isPrerelease(version),
    range,
    tagPattern: tagPattern(pkg.component, Boolean(pkg.prerelease)),
    commits: sinceStable,
  };
}
