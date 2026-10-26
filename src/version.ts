export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string>;
}

export type BumpLevel = 'major' | 'minor' | 'patch';

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseVersion(input: string): Version | null {
  const match = SEMVER.exec(input);

  if (!match) {
    return null;
  }

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

const sign = (left: number | string, right: number | string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = isNumeric(left);
  const rightNumeric = isNumeric(right);

  if (leftNumeric && rightNumeric) {
    return sign(Number(left), Number(right));
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }

  return sign(left, right);
}

/** A version without pre-release ranks above one with. */
const compareStability = (a: Array<string>, b: Array<string>): number =>
  sign(a.length === 0 ? 1 : 0, b.length === 0 ? 1 : 0);

function comparePrerelease(a: Array<string>, b: Array<string>): number {
  if (a.length === 0 || b.length === 0) {
    return compareStability(a, b);
  }

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];

    if (left === undefined || right === undefined) {
      return left === undefined ? -1 : 1;
    }

    const result = compareIdentifiers(left, right);

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

export function compareVersions(a: Version, b: Version): number {
  return (
    sign(a.major, b.major) ||
    sign(a.minor, b.minor) ||
    sign(a.patch, b.patch) ||
    comparePrerelease(a.prerelease, b.prerelease)
  );
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

function baseVersion(input: NextVersionInput, level: BumpLevel): Version {
  if (input.lastStable) {
    return bumpVersion(input.lastStable, level, input.minorPreMajor);
  }

  if (input.initialVersion) {
    return {...input.initialVersion, prerelease: []};
  }

  return bumpVersion(
    {major: 0, minor: 0, patch: 0, prerelease: []},
    level,
    input.minorPreMajor,
  );
}

/** Next counter for `id` on `base`: continues the last pre-release of the same core and identifier. */
function prereleaseCounter(
  last: Version | undefined,
  base: Version,
  id: string,
): number {
  if (
    !last ||
    !isPrerelease(last) ||
    !sameCore(last, base) ||
    last.prerelease[0] !== id
  ) {
    return 1;
  }

  const current = last.prerelease[1];

  return last.prerelease.length === 2 &&
    current !== undefined &&
    isNumeric(current)
    ? Number(current) + 1
    : 1;
}

export function nextVersion(input: NextVersionInput): Version | null {
  const {level, releaseAs} = input;

  if (releaseAs && isPrerelease(releaseAs)) {
    return releaseAs;
  }

  const base = releaseAs ?? (level === null ? null : baseVersion(input, level));

  if (!base) {
    return null;
  }

  const id = input.prerelease;

  if (!id) {
    return base;
  }

  return {
    ...base,
    prerelease: [id, String(prereleaseCounter(input.lastAny, base, id))],
  };
}
