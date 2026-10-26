import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'yaml';
import {z} from 'zod';
import {parseVersion, type Version} from './version.js';

export const CONFIG_FILE = 'relwolf.yaml';

/** Branch name segment of the package without a component when each package gets its own release request. */
export const ROOT_KEY = 'root';

export const UPDATER_TYPES = [
  'package-json',
  'pom-xml',
  'gradle',
  'pyproject',
  'cargo',
  'dotnet',
  'helm',
  'json',
  'yaml',
  'toml',
  'generic',
] as const;
export type UpdaterType = (typeof UPDATER_TYPES)[number];

const prereleaseId = z
  .string()
  .regex(/^[0-9A-Za-z-]+$/, 'must only contain [0-9A-Za-z-]');

const updaterSchema = z.strictObject({
  type: z.enum(UPDATER_TYPES).describe('Kind of file to update.'),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      'File to update, relative to the package path. Defaults to the usual file of the type; required for json, yaml, toml and generic.',
    ),
  key: z
    .string()
    .min(1)
    .optional()
    .describe('Dotted key path of the version (json, yaml and toml updaters).'),
  lockfiles: z
    .boolean()
    .optional()
    .describe('Also update the lockfiles next to the manifest.'),
});

const packageSchema = z.strictObject({
  'component': z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'invalid component name')
    .optional()
    .describe(
      'Tag prefix of the package. Optional for a single package, required for every other package.',
    ),
  'changelog-path': z
    .string()
    .min(1)
    .optional()
    .describe('Changelog file, relative to the package path.'),
  'updaters': z
    .array(updaterSchema)
    .default([])
    .describe('Files in which the version is updated.'),
  'prerelease': prereleaseId
    .optional()
    .describe('Pre-release identifier of this package, e.g. "beta".'),
  'bump-minor-pre-major': z
    .boolean()
    .optional()
    .describe(
      'Breaking changes only bump the minor version before 1.0.0 (overrides the global value).',
    ),
  'initial-version': z
    .string()
    .optional()
    .describe('First stable version if the package has no release tag yet.'),
});

const placeholders = (
  allowed: ReadonlyArray<string>,
): ((value: string) => boolean) => {
  return value =>
    (value.match(/\$\{[^}]*\}/g) ?? []).every(item => allowed.includes(item));
};

const count = (value: string, needle: string): number =>
  value.split(needle).length - 1;

const TITLE_PLACEHOLDERS = ['${tags}', '${version}'] as const;
const BODY_PLACEHOLDERS = [
  '${tags}',
  '${version}',
  '${releases}',
  '${hint}',
  '${release}',
  '${notes}',
] as const;
const RELEASE_NAME_PLACEHOLDERS = ['${tag}', '${version}', '${component}'];
const TAG_PLACEHOLDERS = ['${component}', '${version}'];

const commitType = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9-]*$/, 'must be a commit type such as "feat"');

const label = z
  .string()
  .min(1)
  .regex(/^[^,\r\n]+$/, 'must be a single line without commas');

const userNames = z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/));

export const configSchema = z.strictObject({
  'branch': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Branch to release from. Defaults to the CI default branch, then "main".',
    ),
  'branch-prefix': z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
      'must only contain letters, digits and [._/-]',
    )
    .refine(
      value => !value.includes('..') && !value.includes('//'),
      'must not contain ".." or "//"',
    )
    .default('relwolf/')
    .describe('Prefix of the release branch.'),
  'cliff-config': z
    .string()
    .min(1)
    .optional()
    .describe(
      "Path to the git-cliff config. Defaults to git-cliff's own discovery.",
    ),
  'pre-commit-script': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Script in the working tree (path relative to the repository root) that runs after the release files are written and before they are committed. Everything it changes ends up in the release commit.',
    ),
  'pull-request-title': z
    .string()
    .min(1)
    .regex(/^[^\r\n]+$/, 'must be a single line')
    .refine(
      placeholders(TITLE_PLACEHOLDERS),
      'only ${tags} and ${version} are supported',
    )
    .optional()
    .describe(
      'Title of the release request (single line). Placeholders: ${tags}, ${version}.',
    ),
  'pull-request-body': z
    .string()
    .min(1)
    .refine(
      placeholders(BODY_PLACEHOLDERS),
      'only ${tags}, ${version}, ${releases}, ${hint}, ${release} and ${notes} are supported',
    )
    .refine(
      value => count(value, '${notes}') === 1,
      'must contain ${notes} exactly once',
    )
    .optional()
    .describe(
      'Body template of the release request; must contain ${notes} exactly once. Placeholders: ${tags}, ${version}, ${releases}, ${hint}, ${release}, ${notes}.',
    ),
  'release-commit-message': z
    .string()
    .min(1)
    .refine(
      placeholders(TITLE_PLACEHOLDERS),
      'only ${tags} and ${version} are supported',
    )
    .optional()
    .describe(
      'Message of the release commit (may span several lines). Defaults to the request title. Placeholders: ${tags}, ${version}.',
    ),
  'release-name': z
    .string()
    .min(1)
    .regex(/^[^\r\n]+$/, 'must be a single line')
    .refine(
      placeholders(RELEASE_NAME_PLACEHOLDERS),
      'only ${tag}, ${version} and ${component} are supported',
    )
    .default('${tag}')
    .describe(
      'Title template of the created releases. Placeholders: ${tag}, ${version}, ${component}.',
    ),
  'tag-template': z
    .string()
    .regex(
      /^[A-Za-z0-9._/@${}-]+$/,
      'must only contain letters, digits, ${component}, ${version} and [._/@-]',
    )
    .refine(
      placeholders(TAG_PLACEHOLDERS),
      'only ${component} and ${version} are supported',
    )
    .refine(
      value => count(value, '${version}') === 1,
      'must contain ${version} exactly once',
    )
    .refine(
      value => count(value, '${component}') <= 1,
      'must contain ${component} at most once',
    )
    .default('${component}-v${version}')
    .describe(
      'Tag format. Must contain ${version} exactly once and may contain ${component} once.',
    ),
  'labels': z
    .strictObject({
      pending: label
        .optional()
        .describe('Label of open release requests ("relwolf: pending").'),
      tagged: label
        .optional()
        .describe(
          'Label of merged and tagged release requests ("relwolf: tagged").',
        ),
    })
    .default({})
    .describe('Labels used to track release requests.'),
  'draft': z
    .boolean()
    .default(false)
    .describe('Open the release request as draft.'),
  'release-emoji': z
    .boolean()
    .default(false)
    .describe('Prefix the default release title with a random emoji.'),
  'no-changes-text': z
    .string()
    .default('No changes, version bumped to stay in sync.')
    .describe(
      'Text for packages that were only released to follow linked packages; empty to add nothing.',
    ),
  'assignees': userNames
    .default([])
    .describe('Usernames assigned when the release request is created.'),
  'reviewers': userNames
    .default([])
    .describe('Usernames requested as reviewers when the request is created.'),
  'patch-types': z
    .array(commitType)
    .default(['fix'])
    .describe('Commit types that trigger a patch release.'),
  'minor-types': z
    .array(commitType)
    .default(['feat'])
    .describe(
      'Commit types that trigger a minor release. Breaking changes always trigger a major release.',
    ),
  'exclude-paths': z
    .array(z.string().min(1))
    .default([])
    .describe('Globs from the repository root whose changes never count.'),
  'bootstrap-sha': z
    .string()
    .regex(/^[0-9a-fA-F]{7,40}$/, 'must be a commit sha (7 to 40 hex digits)')
    .optional()
    .describe(
      'History up to and including this commit is ignored for packages without a release tag.',
    ),
  'separate-pull-requests': z
    .boolean()
    .default(false)
    .describe('Create one release request per package or linked group.'),
  'linked-versions': z
    .union([z.boolean(), z.array(z.array(z.string().min(1)).min(2))])
    .default(false)
    .describe(
      'true: all packages share one version; or a list of groups of package paths that share one.',
    ),
  'linked-tags': z
    .enum(['per-package', 'single'])
    .default('per-package')
    .describe(
      'per-package: every package gets its own tag; single: one tag and release per linked group.',
    ),
  'prerelease': prereleaseId
    .optional()
    .describe('Pre-release identifier for all packages, e.g. "beta".'),
  'bump-minor-pre-major': z
    .boolean()
    .default(true)
    .describe(
      'Breaking changes only bump the minor version before 1.0.0 (default for all packages).',
    ),
  'packages': z
    .record(z.string(), packageSchema)
    .default({'.': {updaters: []}})
    .describe(
      'Packages by path relative to the repository root ("." for the root).',
    ),
});

/** JSON Schema of `relwolf.yaml` for editor completion, published at `docs/public/schema.json`. */
export function configJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(configSchema, {target: 'draft-7', io: 'input'}),
    title: CONFIG_FILE,
    description: 'Configuration of relwolf.',
  };
}

export interface UpdaterConfig {
  type: UpdaterType;
  /** Repository-relative POSIX path. */
  path: string;
  /** Dotted key path of the json/yaml/toml updaters. */
  key?: string;
  /** Whether lockfiles next to the manifest are updated too. */
  lockfiles: boolean;
}

export interface PackageConfig {
  /** Repository-relative POSIX path, "." for the root. */
  path: string;
  component?: string;
  changelogPath: string;
  updaters: Array<UpdaterConfig>;
  prerelease?: string;
  minorPreMajor: boolean;
  initialVersion?: Version;
  /** Text of the release tag in front of and behind the version, derived from `tag-template`. */
  tagPrefix: string;
  tagSuffix: string;
}

export interface Config {
  branch?: string;
  /** Prefix of the release branch, e.g. "relwolf/". */
  branchPrefix: string;
  cliffConfig?: string;
  /** Repository-relative path of a script that may change the files of the release commit. */
  preCommitScript?: string;
  /** Template for the release request title, see `renderTitle`. */
  pullRequestTitle?: string;
  /** Template for the release request body, see `renderBody`. */
  pullRequestBody?: string;
  /** Template for the release commit message; the release request title when omitted. */
  releaseCommitMessage?: string;
  /** Template for the title of the created releases, see `renderReleaseName`. */
  releaseName: string;
  labels: {pending: string; tagged: string};
  draft: boolean;
  /** Prefix the default release title with a random emoji. */
  releaseEmoji: boolean;
  /** Text for the changelog and release notes of a package without changes; empty to add nothing. */
  noChangesText: string;
  assignees: Array<string>;
  reviewers: Array<string>;
  /** Commit types (lower case) that trigger a minor or patch release; breaking changes always trigger a major one. */
  minorTypes: Array<string>;
  patchTypes: Array<string>;
  /** Globs (relative to the repository root) whose changes never count for any package. */
  excludePaths: Array<string>;
  /** Commits up to and including this one are ignored for packages without a release tag. */
  bootstrapSha?: string;
  /** One release request per package (or group of linked packages). */
  separatePullRequests: boolean;
  /** Groups of package paths that always share one version. */
  linkedGroups: Array<Array<string>>;
  /** `single`: a linked group gets one tag and release, named by `tagPackagePath`. */
  linkedTags: 'per-package' | 'single';
  packages: Array<PackageConfig>;
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

const DEFAULT_UPDATER_PATH: Partial<Record<UpdaterType, string>> = {
  'package-json': 'package.json',
  'pom-xml': 'pom.xml',
  'gradle': 'build.gradle',
  'pyproject': 'pyproject.toml',
  'cargo': 'Cargo.toml',
  'helm': 'Chart.yaml',
};

const KEY_TYPES = new Set<UpdaterType>(['json', 'yaml', 'toml']);

/**
 * Text before and after the version in the tags of a package. Without a component, `${component}` and the
 * separator characters right behind it are dropped ("${component}-v${version}" becomes "v${version}").
 */
export function tagFormat(
  template: string,
  component: string | undefined,
): {prefix: string; suffix: string} {
  const resolved = template.replace(
    /\$\{component\}([^A-Za-z0-9${]*)/,
    (_, separator: string) => (component ? `${component}${separator}` : ''),
  );
  const [prefix = '', suffix = ''] = resolved.split('${version}');

  return {prefix, suffix};
}

/** The package of a linked group whose tag format names the shared tag: the root package, else the first one. */
export function tagPackagePath(group: ReadonlyArray<string>): string {
  return group.includes('.') ? '.' : (group[0] ?? '.');
}

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

  const packages: Array<PackageConfig> = Object.entries(parsed.packages).map(
    ([rawPath, pkg]) => {
      const pkgPath = normalizeRepoPath(rawPath, 'Package path');
      const join = (relative: string, what: string): string =>
        normalizeRepoPath(
          path.posix.join(pkgPath, normalizeRepoPath(relative, what)),
          what,
        );

      const updaters = pkg.updaters.map((updater): UpdaterConfig => {
        const configured = updater.path ?? DEFAULT_UPDATER_PATH[updater.type];

        if (!configured) {
          throw new ConfigError(
            `Package "${rawPath}": updater "${updater.type}" requires a "path"`,
          );
        }

        const needsKey = KEY_TYPES.has(updater.type);

        if (needsKey && !updater.key) {
          throw new ConfigError(
            `Package "${rawPath}": updater "${updater.type}" requires a "key" (e.g. "version")`,
          );
        }

        if (!needsKey && updater.key) {
          throw new ConfigError(
            `Package "${rawPath}": "key" is only supported by the json, yaml and toml updaters`,
          );
        }

        return {
          type: updater.type,
          path: join(configured, 'Updater path'),
          ...(updater.key ? {key: updater.key} : {}),
          lockfiles: updater.lockfiles ?? true,
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
      const format = tagFormat(parsed['tag-template'], pkg.component);

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
        tagPrefix: format.prefix,
        tagSuffix: format.suffix,
      };
    },
  );

  if (packages.length === 0) {
    throw new ConfigError(`${CONFIG_FILE} must define at least one package`);
  }

  const seenPaths = new Set<string>();
  const seenComponents = new Set<string | undefined>();

  for (const pkg of packages) {
    if (seenPaths.has(pkg.path)) {
      throw new ConfigError(`Duplicate package path "${pkg.path}"`);
    }

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

  const patchTypes = parsed['patch-types'].map(type => type.toLowerCase());
  const minorTypes = parsed['minor-types'].map(type => type.toLowerCase());
  const both = minorTypes.filter(type => patchTypes.includes(type));

  if (both.length > 0) {
    throw new ConfigError(
      `Commit type "${both[0]}" is listed in both "minor-types" and "patch-types"`,
    );
  }

  const excludePaths = parsed['exclude-paths'].map(pattern => {
    const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//, '');

    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new ConfigError(
        `exclude-paths: "${pattern}" must be a relative path inside the repository`,
      );
    }

    return normalized;
  });

  const linked = parsed['linked-versions'];
  const linkedGroups: Array<Array<string>> =
    linked === true
      ? [packages.map(pkg => pkg.path)]
      : linked === false
        ? []
        : linked.map(group =>
            group.map(entry => normalizeRepoPath(entry, 'linked-versions')),
          );
  const grouped = new Set<string>();

  for (const entry of linkedGroups.flat()) {
    if (!seenPaths.has(entry)) {
      throw new ConfigError(
        `linked-versions: "${entry}" is not a configured package path`,
      );
    }

    if (grouped.has(entry)) {
      throw new ConfigError(
        `linked-versions: package "${entry}" is part of more than one group`,
      );
    }

    grouped.add(entry);
  }

  const single = parsed['linked-tags'] === 'single';

  if (single && linkedGroups.length === 0) {
    throw new ConfigError('linked-tags: "single" requires "linked-versions"');
  }

  const followers = new Set(
    single
      ? linkedGroups.flatMap(group =>
          group.filter(entry => entry !== tagPackagePath(group)),
        )
      : [],
  );
  const seenTagFormats = new Set<string>();

  for (const pkg of packages) {
    const format = `${pkg.tagPrefix}\u0000${pkg.tagSuffix}`;

    if (followers.has(pkg.path)) {
      continue;
    }

    if (seenTagFormats.has(format)) {
      throw new ConfigError(
        'tag-template must contain ${component} when several packages are released, otherwise their tags collide',
      );
    }

    seenTagFormats.add(format);
  }

  if (
    parsed['separate-pull-requests'] &&
    packages.some(pkg => !pkg.component) &&
    packages.some(pkg => pkg.component === ROOT_KEY)
  ) {
    throw new ConfigError(
      `separate-pull-requests: the component name "${ROOT_KEY}" is reserved for the package without a component`,
    );
  }

  const labels = {
    pending: parsed.labels.pending ?? 'relwolf: pending',
    tagged: parsed.labels.tagged ?? 'relwolf: tagged',
  };

  if (labels.pending === labels.tagged) {
    throw new ConfigError('labels: "pending" and "tagged" must differ');
  }

  if (
    parsed['release-emoji'] &&
    parsed['pull-request-body'] &&
    !parsed['pull-request-body'].includes('${release}')
  ) {
    throw new ConfigError(
      'release-emoji requires ${release} in pull-request-body',
    );
  }

  return {
    ...(parsed.branch ? {branch: parsed.branch} : {}),
    branchPrefix: parsed['branch-prefix'],
    ...(parsed['pre-commit-script']
      ? {
          preCommitScript: normalizeRepoPath(
            parsed['pre-commit-script'],
            'pre-commit-script',
          ),
        }
      : {}),
    ...(parsed['cliff-config']
      ? {cliffConfig: normalizeRepoPath(parsed['cliff-config'], 'cliff-config')}
      : {}),
    ...(parsed['pull-request-title']
      ? {pullRequestTitle: parsed['pull-request-title']}
      : {}),
    ...(parsed['pull-request-body']
      ? {pullRequestBody: parsed['pull-request-body']}
      : {}),
    ...(parsed['release-commit-message']
      ? {releaseCommitMessage: parsed['release-commit-message']}
      : {}),
    releaseName: parsed['release-name'],
    labels,
    draft: parsed.draft,
    releaseEmoji: parsed['release-emoji'],
    noChangesText: parsed['no-changes-text'],
    assignees: parsed.assignees,
    reviewers: parsed.reviewers,
    minorTypes,
    patchTypes,
    excludePaths,
    ...(parsed['bootstrap-sha'] ? {bootstrapSha: parsed['bootstrap-sha']} : {}),
    separatePullRequests: parsed['separate-pull-requests'],
    linkedGroups,
    linkedTags: parsed['linked-tags'],
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
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return {config: parseConfig(source), found: source !== undefined};
}
