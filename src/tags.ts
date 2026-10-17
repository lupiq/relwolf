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

export function tagPrefix(component?: string): string {
  return component ? `${component}-v` : 'v';
}

export function tagName(
  component: string | undefined,
  version: string,
): string {
  return `${tagPrefix(component)}${version}`;
}

/** Valid release tags of one package, parsed from the list of all tags. */
export function findReleaseTags(
  allTags: readonly string[],
  component?: string,
): ReleaseTag[] {
  const prefix = tagPrefix(component);
  const result: ReleaseTag[] = [];
  for (const tag of allTags) {
    if (!tag.startsWith(prefix)) continue;
    const version = parseVersion(tag.slice(prefix.length));
    if (version) result.push({tag, version});
  }
  return result;
}

export function highest(tags: readonly ReleaseTag[]): ReleaseTag | undefined {
  return tags.reduce<ReleaseTag | undefined>(
    (best, candidate) =>
      !best || compareVersions(candidate.version, best.version) > 0
        ? candidate
        : best,
    undefined,
  );
}

export function highestStable(
  tags: readonly ReleaseTag[],
): ReleaseTag | undefined {
  return highest(tags.filter(entry => !isPrerelease(entry.version)));
}

/** Regex (Rust/JS compatible) matching the tags of a package; with or without pre-releases. */
export function tagPattern(
  component: string | undefined,
  includePrereleases: boolean,
): string {
  const core = '[0-9]+\\.[0-9]+\\.[0-9]+';
  const pre = includePrereleases
    ? '(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?'
    : '';
  return `^${escapeRegex(tagPrefix(component))}${core}${pre}$`;
}

/** Validates a tag read from untrusted text (e.g. a merge request description). */
export function isValidReleaseTag(tag: string): boolean {
  const match = /^(?:[A-Za-z0-9][A-Za-z0-9._-]*?-)?v(\d+\.\d+\.\d+.*)$/.exec(
    tag,
  );
  return match?.[1] !== undefined && parseVersion(match[1]) !== null;
}
