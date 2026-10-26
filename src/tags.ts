import type {PackageConfig} from './config.js';
import {
  compareVersions,
  isPrerelease,
  parseVersion,
  type Version,
} from './version.js';

export interface ReleaseTag {
  tag: string;
  version: Version;
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type TagFormat = Pick<PackageConfig, 'tagPrefix' | 'tagSuffix'>;

export function tagName(format: TagFormat, version: string): string {
  return `${format.tagPrefix}${version}${format.tagSuffix}`;
}

/** The version a tag of the given format stands for, if any. */
function versionOfTag(tag: string, format: TagFormat): Version | null {
  if (
    tag.length <= format.tagPrefix.length + format.tagSuffix.length ||
    !tag.startsWith(format.tagPrefix) ||
    !tag.endsWith(format.tagSuffix)
  ) {
    return null;
  }

  return parseVersion(
    tag.slice(format.tagPrefix.length, tag.length - format.tagSuffix.length),
  );
}

/** Valid release tags of one package, parsed from the list of all tags. */
export function findReleaseTags(
  allTags: ReadonlyArray<string>,
  format: TagFormat,
): Array<ReleaseTag> {
  const result: Array<ReleaseTag> = [];

  for (const tag of allTags) {
    const version = versionOfTag(tag, format);

    if (version) {
      result.push({tag, version});
    }
  }

  return result;
}

export function highest(
  tags: ReadonlyArray<ReleaseTag>,
): ReleaseTag | undefined {
  return tags.reduce<ReleaseTag | undefined>(
    (best, candidate) =>
      !best || compareVersions(candidate.version, best.version) > 0
        ? candidate
        : best,
    undefined,
  );
}

export function highestStable(
  tags: ReadonlyArray<ReleaseTag>,
): ReleaseTag | undefined {
  return highest(tags.filter(entry => !isPrerelease(entry.version)));
}

/** Regex (Rust/JS compatible) matching the tags of a package; with or without pre-releases. */
export function tagPattern(
  format: TagFormat,
  includePrereleases: boolean,
): string {
  const core = '[0-9]+\\.[0-9]+\\.[0-9]+';
  const pre = includePrereleases
    ? '(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?'
    : '';

  return `^${escapeRegex(format.tagPrefix)}${core}${pre}${escapeRegex(format.tagSuffix)}$`;
}

/** The package and version a tag belongs to; `null` for anything that is not a release tag of the configuration. */
export function parseReleaseTag(
  tag: string,
  packages: ReadonlyArray<PackageConfig>,
): {pkg: PackageConfig; version: Version} | null {
  // Several packages can match (e.g. "v1.0.0" and "api-v1.0.0" without separator); the longest prefix is the most specific.
  const candidates = [...packages].sort(
    (a, b) => b.tagPrefix.length - a.tagPrefix.length,
  );

  for (const pkg of candidates) {
    const version = versionOfTag(tag, pkg);

    if (version) {
      return {pkg, version};
    }
  }

  return null;
}

/** Validates a tag read from untrusted text (e.g. a merge request description). */
export function isValidReleaseTag(
  tag: string,
  packages: ReadonlyArray<PackageConfig>,
): boolean {
  return parseReleaseTag(tag, packages) !== null;
}
