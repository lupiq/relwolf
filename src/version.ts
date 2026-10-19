export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export type BumpLevel = 'major' | 'minor' | 'patch';

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseVersion(input: string): Version | null {
  const match = SEMVER.exec(input);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

export function formatVersion(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length > 0
    ? `${core}-${version.prerelease.join('.')}`
    : core;
}

export function isPrerelease(version: Version): boolean {
  return version.prerelease.length > 0;
}

const isNumeric = (value: string): boolean => /^\d+$/.test(value);

export function compareVersions(a: Version, b: Version): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length === 0
        ? 1
        : -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNumeric = isNumeric(left);
    const rightNumeric = isNumeric(right);
    if (leftNumeric && rightNumeric)
      return Number(left) < Number(right) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left < right ? -1 : 1;
  }
  return 0;
}

export function sameCore(a: Version, b: Version): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

export function bumpVersion(
  base: Version,
  level: BumpLevel,
  minorPreMajor: boolean,
): Version {
  const effective: BumpLevel =
    level === 'major' && base.major === 0 && minorPreMajor ? 'minor' : level;
  switch (effective) {
    case 'major':
      return {major: base.major + 1, minor: 0, patch: 0, prerelease: []};
    case 'minor':
      return {
        major: base.major,
        minor: base.minor + 1,
        patch: 0,
        prerelease: [],
      };
    case 'patch':
      return {
        major: base.major,
        minor: base.minor,
        patch: base.patch + 1,
        prerelease: [],
      };
  }
}

export interface NextVersionInput {
  /** Highest stable version reachable from HEAD. */
  lastStable?: Version | undefined;
  /** Highest version (stable or pre-release) reachable from HEAD. */
  lastAny?: Version | undefined;
  /** Bump level derived from the commits since `lastStable`. */
  level: BumpLevel | null;
  /** Pre-release identifier (e.g. "beta"); omit for a stable release. */
  prerelease?: string | undefined;
  minorPreMajor: boolean;
  /** Used verbatim as the first stable version when no stable tag exists. */
  initialVersion?: Version | undefined;
  /** Explicitly requested version; replaces the computed one (a pre-release is used verbatim). */
  releaseAs?: Version | undefined;
}

export function nextVersion(input: NextVersionInput): Version | null {
  const {level, releaseAs} = input;
  if (releaseAs && isPrerelease(releaseAs)) return releaseAs;

  let base: Version;
  if (releaseAs) {
    base = releaseAs;
  } else if (level === null) {
    return null;
  } else if (input.lastStable) {
    base = bumpVersion(input.lastStable, level, input.minorPreMajor);
  } else if (input.initialVersion) {
    base = {...input.initialVersion, prerelease: []};
  } else {
    base = bumpVersion(
      {major: 0, minor: 0, patch: 0, prerelease: []},
      level,
      input.minorPreMajor,
    );
  }

  const id = input.prerelease;
  if (!id) return base;

  const last = input.lastAny;
  let counter = 1;
  if (
    last &&
    isPrerelease(last) &&
    sameCore(last, base) &&
    last.prerelease[0] === id
  ) {
    const current = last.prerelease[1];
    counter =
      last.prerelease.length === 2 &&
      current !== undefined &&
      isNumeric(current)
        ? Number(current) + 1
        : 1;
  }
  return {...base, prerelease: [id, String(counter)]};
}
