import type {PackageConfig} from './config.js';
import {formatVersion, parseVersion, type Version} from './version.js';

/** Value that removes a previously requested version again. */
export const RESET = 'auto';

export class ReleaseAsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseAsError';
  }
}

/** Requested versions by component ("" for the package without one); `null` removes a request. */
export type ReleaseAs = Map<string, Version | null>;

export const componentKey = (pkg: Pick<PackageConfig, 'component'>): string =>
  pkg.component ?? '';

/**
 * Parses `RELWOLF_RELEASE_AS`: a comma/whitespace separated list of `[component=]version`, where the
 * version may be `auto` to remove a request. A bare version applies to the package without component
 * (or to the only package).
 */
export function parseReleaseAs(
  input: string | undefined,
  packages: readonly PackageConfig[],
): ReleaseAs {
  const result: ReleaseAs = new Map();
  const keys = new Set(packages.map(componentKey));
  const [only] = packages;
  const bareKey = packages.length === 1 && only ? componentKey(only) : '';

  for (const token of (input ?? '').split(/[\s,]+/).filter(Boolean)) {
    const separator = token.indexOf('=');
    const key = separator === -1 ? bareKey : token.slice(0, separator);
    const raw = separator === -1 ? token : token.slice(separator + 1);

    if (!keys.has(key)) {
      throw new ReleaseAsError(
        key === ''
          ? `RELWOLF_RELEASE_AS: "${token}" needs a component (component=version); every package has one.`
          : `RELWOLF_RELEASE_AS: unknown component "${key}".`,
      );
    }

    if (raw === RESET) {
      result.set(key, null);
      continue;
    }

    const version = parseVersion(raw.replace(/^v/, ''));

    if (!version) {
      throw new ReleaseAsError(
        `RELWOLF_RELEASE_AS: "${raw}" is not a valid semantic version.`,
      );
    }

    result.set(key, version);
  }

  return result;
}

export const describeRequest = (key: string, version: Version): string =>
  `${key === '' ? '' : `${key}=`}${formatVersion(version)}`;
