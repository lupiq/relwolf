import { bumpLevel, parseCommit, type ConventionalCommit } from "./commits.js";
import type { PackageConfig } from "./config.js";
import type { Git } from "./git.js";
import {
  findReleaseTags,
  highest,
  highestStable,
  tagName,
  tagPattern,
} from "./tags.js";
import { formatVersion, isPrerelease, nextVersion, type Version } from "./version.js";

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
export function nestedPackagePaths(pkg: PackageConfig, all: readonly PackageConfig[]): string[] {
  return all
    .filter((other) => other.path !== pkg.path && (pkg.path === "." || other.path.startsWith(`${pkg.path}/`)))
    .map((other) => other.path);
}

export function pathspecsFor(pkg: PackageConfig, all: readonly PackageConfig[]): string[] {
  return [pkg.path, ...nestedPackagePaths(pkg, all).map((nested) => `:(exclude)${nested}`)];
}

async function conventionalCommits(
  git: Git,
  range: string | undefined,
  pathspecs: string[],
): Promise<ConventionalCommit[]> {
  const raw = await git.log(range, pathspecs);
  return raw.flatMap((commit) => parseCommit(commit.sha, commit.message) ?? []);
}

export async function planPackage(
  git: Git,
  pkg: PackageConfig,
  all: readonly PackageConfig[],
): Promise<PackagePlan | null> {
  const releaseTags = findReleaseTags(await git.tagsMergedIntoHead(), pkg.component);
  const lastAny = highest(releaseTags);
  const lastStable = highestStable(releaseTags);
  const pathspecs = pathspecsFor(pkg, all);

  const sinceStable = await conventionalCommits(git, lastStable && `${lastStable.tag}..HEAD`, pathspecs);
  const level = bumpLevel(sinceStable);

  const lastIsPrerelease = lastAny !== undefined && isPrerelease(lastAny.version);
  if (pkg.prerelease && lastIsPrerelease) {
    // Don't publish another pre-release unless something releasable happened since the last one.
    const sinceLast = await conventionalCommits(git, `${lastAny.tag}..HEAD`, pathspecs);
    if (bumpLevel(sinceLast) === null) return null;
  }

  const version = nextVersion({
    lastStable: lastStable?.version,
    lastAny: lastAny?.version,
    level,
    prerelease: pkg.prerelease,
    minorPreMajor: pkg.minorPreMajor,
    initialVersion: pkg.initialVersion,
  });
  if (!version) return null;

  const rangeStart = pkg.prerelease ? lastAny : lastStable;
  return {
    pkg,
    version,
    tag: tagName(pkg.component, formatVersion(version)),
    prerelease: isPrerelease(version),
    range: rangeStart && `${rangeStart.tag}..HEAD`,
    tagPattern: tagPattern(pkg.component, Boolean(pkg.prerelease)),
    commits: sinceStable,
  };
}
