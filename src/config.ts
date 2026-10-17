import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'yaml';
import {z} from 'zod';
import {parseVersion, type Version} from './version.js';

export const CONFIG_FILE = 'relwolf.yaml';

export const UPDATER_TYPES = [
  'package-json',
  'pom-xml',
  'gradle',
  'generic',
] as const;
export type UpdaterType = (typeof UPDATER_TYPES)[number];

const prereleaseId = z
  .string()
  .regex(/^[0-9A-Za-z-]+$/, 'must only contain [0-9A-Za-z-]');

const updaterSchema = z.strictObject({
  type: z.enum(UPDATER_TYPES),
  path: z.string().min(1).optional(),
});

const packageSchema = z.strictObject({
  'component': z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'invalid component name')
    .optional(),
  'changelog-path': z.string().min(1).optional(),
  'updaters': z.array(updaterSchema).default([]),
  'prerelease': prereleaseId.optional(),
  'bump-minor-pre-major': z.boolean().optional(),
  'initial-version': z.string().optional(),
});

const configSchema = z.strictObject({
  'branch': z.string().min(1).optional(),
  'cliff-config': z.string().min(1).optional(),
  'prerelease': prereleaseId.optional(),
  'bump-minor-pre-major': z.boolean().default(true),
  'packages': z
    .record(z.string(), packageSchema)
    .default({'.': {updaters: []}}),
});

export interface UpdaterConfig {
  type: UpdaterType;
  /** Repository-relative POSIX path. */
  path: string;
}

export interface PackageConfig {
  /** Repository-relative POSIX path, "." for the root. */
  path: string;
  component?: string;
  changelogPath: string;
  updaters: UpdaterConfig[];
  prerelease?: string;
  minorPreMajor: boolean;
  initialVersion?: Version;
}

export interface Config {
  branch?: string;
  cliffConfig?: string;
  packages: PackageConfig[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function normalizeRepoPath(value: string, what: string): string {
  const normalized =
    path.posix.normalize(value.replaceAll('\\', '/')).replace(/\/+$/, '') ||
    '.';
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new ConfigError(
      `${what} must be a relative path inside the repository: "${value}"`,
    );
  }
  return normalized;
}

const DEFAULT_UPDATER_PATH: Record<Exclude<UpdaterType, 'generic'>, string> = {
  'package-json': 'package.json',
  'pom-xml': 'pom.xml',
  'gradle': 'build.gradle',
};

export function parseConfig(source: string | undefined): Config {
  let raw: unknown = {};
  if (source !== undefined && source.trim() !== '') {
    try {
      raw = parse(source);
    } catch (error) {
      throw new ConfigError(
        `Invalid YAML in ${CONFIG_FILE}: ${(error as Error).message}`,
      );
    }
  }

  const result = configSchema.safeParse(raw ?? {});
  if (!result.success) {
    const details = result.error.issues
      .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid ${CONFIG_FILE}:\n${details}`);
  }
  const parsed = result.data;

  const packages: PackageConfig[] = Object.entries(parsed.packages).map(
    ([rawPath, pkg]) => {
      const pkgPath = normalizeRepoPath(rawPath, 'Package path');
      const join = (relative: string, what: string): string =>
        normalizeRepoPath(
          path.posix.join(pkgPath, normalizeRepoPath(relative, what)),
          what,
        );

      const updaters = pkg.updaters.map((updater): UpdaterConfig => {
        if (updater.type === 'generic') {
          if (!updater.path) {
            throw new ConfigError(
              `Package "${rawPath}": updater "generic" requires a "path"`,
            );
          }
          return {type: 'generic', path: join(updater.path, 'Updater path')};
        }
        return {
          type: updater.type,
          path: join(
            updater.path ?? DEFAULT_UPDATER_PATH[updater.type],
            'Updater path',
          ),
        };
      });

      let initialVersion: Version | undefined;
      if (pkg['initial-version'] !== undefined) {
        initialVersion = parseVersion(pkg['initial-version']) ?? undefined;
        if (!initialVersion || initialVersion.prerelease.length > 0) {
          throw new ConfigError(
            `Package "${rawPath}": "initial-version" must be a stable semantic version, got "${pkg['initial-version']}"`,
          );
        }
      }

      const prerelease = pkg.prerelease ?? parsed.prerelease;
      return {
        path: pkgPath,
        ...(pkg.component ? {component: pkg.component} : {}),
        changelogPath: join(
          pkg['changelog-path'] ?? 'CHANGELOG.md',
          'changelog-path',
        ),
        updaters,
        ...(prerelease ? {prerelease} : {}),
        minorPreMajor:
          pkg['bump-minor-pre-major'] ?? parsed['bump-minor-pre-major'],
        ...(initialVersion ? {initialVersion} : {}),
      };
    },
  );

  if (packages.length === 0)
    throw new ConfigError(`${CONFIG_FILE} must define at least one package`);

  const seenPaths = new Set<string>();
  const seenComponents = new Set<string | undefined>();
  for (const pkg of packages) {
    if (seenPaths.has(pkg.path))
      throw new ConfigError(`Duplicate package path "${pkg.path}"`);
    seenPaths.add(pkg.path);
    if (seenComponents.has(pkg.component)) {
      throw new ConfigError(
        pkg.component
          ? `Duplicate component "${pkg.component}"`
          : 'At most one package may omit "component"; give every other package a unique one',
      );
    }
    seenComponents.add(pkg.component);
  }

  return {
    ...(parsed.branch ? {branch: parsed.branch} : {}),
    ...(parsed['cliff-config']
      ? {cliffConfig: normalizeRepoPath(parsed['cliff-config'], 'cliff-config')}
      : {}),
    packages,
  };
}

export async function loadConfig(
  repoDir: string,
): Promise<{config: Config; found: boolean}> {
  let source: string | undefined;
  try {
    source = await readFile(path.join(repoDir, CONFIG_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {config: parseConfig(source), found: source !== undefined};
}
