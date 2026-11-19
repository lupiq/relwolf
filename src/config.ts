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

const componentUpdaterSchema = z.strictObject({
  type: z
    .literal('generic')
    .describe('Kind of file to update; only "generic" is supported.'),
  path: z
    .string()
    .min(1)
    .describe(
      'File to update, relative to the repository root. May be a glob.',
    ),
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
  'changelog-title': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Title (first-level heading) of the changelog, replacing the one of the git-cliff header. Placeholder: ${component}.',
    ),
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

export const STRATEGIES = ['conventional-commits', 'changesets'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** Options that changesets decides itself, via `.changeset/config.json` or the workspace. */
const AI_PROVIDERS = ['copilot-cli', 'openai', 'anthropic'] as const;
const AI_CONTEXTS = ['changelog', 'commits', 'full-diff'] as const;

const AI_SETTINGS_SHAPE = {
  'provider': z
    .enum(AI_PROVIDERS)
    .optional()
    .describe(
      'copilot-cli (default) runs the GitHub Copilot CLI; openai calls an OpenAI-compatible API (base-url and model required); anthropic calls the Claude API directly (model required).',
    ),
  'base-url': z
    .url()
    .optional()
    .describe(
      'Base URL of the API (`/chat/completions` is appended for openai, `/messages` for anthropic); required with provider openai, defaults to https://api.anthropic.com/v1 with anthropic.',
    ),
  'model': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Model name; the default of the Copilot CLI if omitted, required with provider openai and anthropic.',
    ),
  'context': z
    .enum(AI_CONTEXTS)
    .optional()
    .describe(
      'Release context sent to the model: generated changelog content, all commits (default), or the full code diff since the previous release.',
    ),
  'audience': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Audience of the release notes as free text, e.g. users (default) for feature-focused notes, developers for technical notes, or your own like "product managers".',
    ),
  'exclude-paths': z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Globs from the repository root excluded from the full-diff context.',
    ),
  'language': z
    .string()
    .min(1)
    .optional()
    .describe('Language of the release notes (default English).'),
  'prompt': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Instructions for the model instead of the built-in ones. Placeholders: ${language}, ${tag}, ${version}, ${component}, ${audience}.',
    ),
};

const AI_SCOPE_SHAPE = {
  'packages': z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Packages (component name or path) that get these release notes; all packages if omitted.',
    ),
  'exclude-packages': z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Packages (component name or path) that do not get these release notes.',
    ),
};

const CHANGESETS_REJECTED_OPTIONS = [
  'patch-types',
  'minor-types',
  'cliff-config',
  'rewrite-changelog',
  'exclude-paths',
  'bootstrap-sha',
  'linked-versions',
  'linked-tags',
  'prerelease',
  'bump-minor-pre-major',
  'tag-template',
  'changelog-links',
  'changelog-links-text',
  'no-changes-text',
  'separate-pull-requests',
  'packages',
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
  'strategy': z
    .enum(STRATEGIES)
    .default('conventional-commits')
    .describe(
      'How versions and changelogs are determined: conventional-commits (git-cliff) or changesets (.changeset directory).',
    ),
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
  'rewrite-changelog': z
    .boolean()
    .default(false)
    .describe(
      'Regenerate the whole changelog of every released package when the git-cliff config changed since its last release.',
    ),
  'pre-commit-script': z
    .string()
    .min(1)
    .optional()
    .describe(
      'Script in the working tree (path relative to the repository root) that runs after the release files are written and before they are committed. Everything it changes ends up in the release commit.',
    ),
  'pre-commit-script-tokens': z
    .boolean()
    .default(false)
    .describe(
      'Pass RELWOLF_TOKEN, GITHUB_TOKEN and GITLAB_TOKEN to the pre-commit-script; they are removed from its environment by default.',
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
  'changelog-links': z
    .boolean()
    .default(false)
    .describe(
      'Link the changelogs of all other packages in the header of the changelog of the root package.',
    ),
  'changelog-links-text': z
    .string()
    .min(1)
    .default('For changes to individual components, see their changelogs:')
    .describe('Text above the links of `changelog-links`.'),
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
  'ai-release-notes': z
    .strictObject({
      ...AI_SETTINGS_SHAPE,
      'changelog': z
        .union([
          z.boolean(),
          z.strictObject({...AI_SETTINGS_SHAPE, ...AI_SCOPE_SHAPE}),
        ])
        .optional()
        .describe(
          'Adds release notes to the changelog and the created release: true, or an object with its own options (and packages / exclude-packages).',
        ),
      'additional-files': z
        .array(
          z.strictObject({
            ...AI_SETTINGS_SHAPE,
            ...AI_SCOPE_SHAPE,
            'file': z
              .string()
              .min(1)
              .describe(
                'Markdown file (repository-relative) that gets a new entry per release. ${path} and ${component} are replaced per package, which writes one file per package.',
              ),
            'file-title': z
              .string()
              .min(1)
              .default('Release summaries')
              .describe('First-level heading of the release notes file.'),
          }),
        )
        .default([])
        .describe(
          'Additional Markdown files with their own release notes; unset options are inherited from the top level.',
        ),
    })
    .prefault({})
    .describe(
      'AI generated release notes. Enabled by changelog and/or at least one entry of additional-files; the other options are only defaults for them.',
    ),
  'http-timeout': z
    .number()
    .int()
    .positive()
    .max(3600)
    .default(120)
    .describe(
      'Seconds an API request attempt may take before it is aborted (1 to 3600). Timed out requests are retried, except POST requests.',
    ),
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
  'updaters': z
    .array(componentUpdaterSchema)
    .default([])
    .describe(
      'Files with component markers (x-relwolf-version:<component>) that get the versions of several packages.',
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

/** Fully resolved settings of one AI release notes output. */
export interface AiSettings {
  provider: (typeof AI_PROVIDERS)[number];
  /** API base URL, with provider openai (required) or anthropic (optional). */
  baseUrl?: string;
  model?: string;
  context: (typeof AI_CONTEXTS)[number];
  audience: string;
  /** Globs from the repository root excluded from the full-diff context. */
  excludePaths: Array<string>;
  language: string;
  prompt?: string;
}

/** The packages an output applies to. */
export interface AiScope {
  /** Component names or paths; all packages if empty. */
  packages: Array<string>;
  excludePackages: Array<string>;
}

export interface AiFileConfig extends AiSettings, AiScope {
  /** Repository-relative path of the release notes file; may contain `${path}` and `${component}`. */
  file: string;
  fileTitle: string;
}

export interface AiReleaseNotesConfig {
  /** Release notes in the changelog; undefined if only additional files are configured. */
  changelog?: AiSettings & AiScope;
  files: Array<AiFileConfig>;
}

export interface PackageConfig {
  /** Repository-relative POSIX path, "." for the root. */
  path: string;
  component?: string;
  changelogPath: string;
  changelogTitle?: string;
  updaters: Array<UpdaterConfig>;
  prerelease?: string;
  minorPreMajor: boolean;
  initialVersion?: Version;
  /** Text of the release tag in front of and behind the version, derived from `tag-template`. */
  tagPrefix: string;
  tagSuffix: string;
}

export interface Config {
  /** Where versions and changelogs come from. */
  strategy: Strategy;
  branch?: string;
  /** Prefix of the release branch, e.g. "relwolf/". */
  branchPrefix: string;
  cliffConfig?: string;
  /** Repository-relative path of a script that may change the files of the release commit. */
  preCommitScript?: string;
  /** Whether the pre-commit-script gets the tokens; they are removed from its environment otherwise. */
  preCommitScriptTokens: boolean;
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
  /** Regenerate whole changelogs if the git-cliff config changed since the last release. */
  rewriteChangelog: boolean;
  /** Text for the changelog and release notes of a package without changes; empty to add nothing. */
  noChangesText: string;
  /** Link the changelogs of the other packages in the changelog of the root package. */
  changelogLinks: boolean;
  /** Text above the links. */
  changelogLinksText: string;
  assignees: Array<string>;
  reviewers: Array<string>;
  aiReleaseNotes: AiReleaseNotesConfig;
  /** Seconds every attempt of an API request may take. */
  httpTimeout: number;
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
  /** Repository-relative POSIX paths (or globs) of files with component markers. */
  componentUpdaters: Array<{type: 'generic'; path: string}>;
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

type ParsedConfig = z.infer<typeof configSchema>;
type ParsedPackage = ParsedConfig['packages'][string];

function parseYaml(source: string | undefined): unknown {
  if (source === undefined || source.trim() === '') {
    return {};
  }

  try {
    return parse(source);
  } catch (error) {
    throw new ConfigError(
      `Invalid YAML in ${CONFIG_FILE}: ${(error as Error).message}`,
    );
  }
}

function validateSchema(raw: unknown): ParsedConfig {
  const result = configSchema.safeParse(raw ?? {});

  if (!result.success) {
    const details = result.error.issues
      .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new ConfigError(`Invalid ${CONFIG_FILE}:\n${details}`);
  }

  return result.data;
}

function buildUpdater(
  updater: ParsedPackage['updaters'][number],
  rawPath: string,
  join: (relative: string, what: string) => string,
): UpdaterConfig {
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
}

function parseInitialVersion(
  value: string | undefined,
  rawPath: string,
): Version | undefined {
  if (value === undefined) {
    return undefined;
  }

  const initialVersion = parseVersion(value) ?? undefined;

  if (!initialVersion || initialVersion.prerelease.length > 0) {
    throw new ConfigError(
      `Package "${rawPath}": "initial-version" must be a stable semantic version, got "${value}"`,
    );
  }

  return initialVersion;
}

function buildPackage(
  rawPath: string,
  pkg: ParsedPackage,
  parsed: ParsedConfig,
): PackageConfig {
  const pkgPath = normalizeRepoPath(rawPath, 'Package path');
  const join = (relative: string, what: string): string =>
    normalizeRepoPath(
      path.posix.join(pkgPath, normalizeRepoPath(relative, what)),
      what,
    );
  const updaters = pkg.updaters.map(updater =>
    buildUpdater(updater, rawPath, join),
  );
  const initialVersion = parseInitialVersion(pkg['initial-version'], rawPath);
  const prerelease = pkg.prerelease ?? parsed.prerelease;
  const format = tagFormat(parsed['tag-template'], pkg.component);

  return {
    path: pkgPath,
    ...(pkg.component ? {component: pkg.component} : {}),
    changelogPath: join(
      pkg['changelog-path'] ?? 'CHANGELOG.md',
      'changelog-path',
    ),
    ...(pkg['changelog-title'] ? {changelogTitle: pkg['changelog-title']} : {}),
    updaters,
    ...(prerelease ? {prerelease} : {}),
    minorPreMajor:
      pkg['bump-minor-pre-major'] ?? parsed['bump-minor-pre-major'],
    ...(initialVersion ? {initialVersion} : {}),
    tagPrefix: format.prefix,
    tagSuffix: format.suffix,
  };
}

function checkUniquePackages(packages: ReadonlyArray<PackageConfig>): void {
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
}

function parseTypes(parsed: ParsedConfig): {
  minorTypes: Array<string>;
  patchTypes: Array<string>;
} {
  const patchTypes = parsed['patch-types'].map(type => type.toLowerCase());
  const minorTypes = parsed['minor-types'].map(type => type.toLowerCase());
  const both = minorTypes.filter(type => patchTypes.includes(type));

  if (both.length > 0) {
    throw new ConfigError(
      `Commit type "${both[0]}" is listed in both "minor-types" and "patch-types"`,
    );
  }

  return {minorTypes, patchTypes};
}

function parseExcludePaths(
  patterns: ReadonlyArray<string>,
  option = 'exclude-paths',
): Array<string> {
  return patterns.map(pattern => {
    const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//, '');

    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new ConfigError(
        `${option}: "${pattern}" must be a relative path inside the repository`,
      );
    }

    return normalized;
  });
}

function parseLinkedGroups(
  linked: ParsedConfig['linked-versions'],
  packages: ReadonlyArray<PackageConfig>,
): Array<Array<string>> {
  const linkedGroups: Array<Array<string>> =
    linked === true
      ? [packages.map(pkg => pkg.path)]
      : linked === false
        ? []
        : linked.map(group =>
            group.map(entry => normalizeRepoPath(entry, 'linked-versions')),
          );
  const known = new Set(packages.map(pkg => pkg.path));
  const grouped = new Set<string>();

  for (const entry of linkedGroups.flat()) {
    if (!known.has(entry)) {
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

  return linkedGroups;
}

function checkTagFormats(
  packages: ReadonlyArray<PackageConfig>,
  linkedGroups: ReadonlyArray<ReadonlyArray<string>>,
  linkedTags: ParsedConfig['linked-tags'],
): void {
  const single = linkedTags === 'single';

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
}

function parseLabels(labels: ParsedConfig['labels']): Config['labels'] {
  const result = {
    pending: labels.pending ?? 'relwolf: pending',
    tagged: labels.tagged ?? 'relwolf: tagged',
  };

  if (result.pending === result.tagged) {
    throw new ConfigError('labels: "pending" and "tagged" must differ');
  }

  return result;
}

function checkPullRequestSettings(
  parsed: ParsedConfig,
  packages: ReadonlyArray<PackageConfig>,
): void {
  if (
    parsed['separate-pull-requests'] &&
    packages.some(pkg => !pkg.component) &&
    packages.some(pkg => pkg.component === ROOT_KEY)
  ) {
    throw new ConfigError(
      `separate-pull-requests: the component name "${ROOT_KEY}" is reserved for the package without a component`,
    );
  }
}

function checkComponentUpdaters(
  parsed: ParsedConfig,
  packages: ReadonlyArray<PackageConfig>,
): void {
  if (
    parsed.updaters.length > 0 &&
    packages.some(pkg => !pkg.component) &&
    packages.some(pkg => pkg.component === ROOT_KEY)
  ) {
    throw new ConfigError(
      `updaters: the component name "${ROOT_KEY}" is reserved for the package without a component`,
    );
  }
}

function checkReleaseEmoji(parsed: ParsedConfig): void {
  if (
    parsed['release-emoji'] &&
    parsed['pull-request-body'] &&
    !parsed['pull-request-body'].includes('${release}')
  ) {
    throw new ConfigError(
      'release-emoji requires ${release} in pull-request-body',
    );
  }
}

type AiRawSettings = {
  [Key in keyof typeof AI_SETTINGS_SHAPE]?: z.output<
    (typeof AI_SETTINGS_SHAPE)[Key]
  >;
};

type AiRawScope = {
  [Key in keyof typeof AI_SCOPE_SHAPE]?: z.output<(typeof AI_SCOPE_SHAPE)[Key]>;
};

function resolveAiSettings(
  own: AiRawSettings,
  shared: AiRawSettings,
  label: string,
): AiSettings {
  const pick = <Key extends keyof AiRawSettings>(key: Key) =>
    own[key] ?? shared[key];
  const provider = pick('provider') ?? 'copilot-cli';
  const baseUrl = pick('base-url');
  const model = pick('model');
  const prompt = pick('prompt');

  if (provider === 'openai' && !(baseUrl && model)) {
    throw new ConfigError(
      `${label}: the provider "openai" requires "base-url" and "model"`,
    );
  }

  if (provider === 'anthropic' && !model) {
    throw new ConfigError(
      `${label}: the provider "anthropic" requires "model"`,
    );
  }

  if (provider === 'copilot-cli' && baseUrl) {
    throw new ConfigError(
      `${label}: "base-url" only works with the providers "openai" and "anthropic"`,
    );
  }

  return {
    provider,
    ...(baseUrl ? {baseUrl} : {}),
    ...(model ? {model} : {}),
    context: pick('context') ?? 'commits',
    audience: pick('audience') ?? 'users',
    excludePaths: parseExcludePaths(
      pick('exclude-paths') ?? [],
      `${label}.exclude-paths`,
    ),
    language: pick('language') ?? 'English',
    ...(prompt ? {prompt} : {}),
  };
}

function parseAiScope(
  own: AiRawScope,
  packages: ReadonlyArray<PackageConfig>,
  label: string,
): AiScope {
  const scope = {
    packages: own.packages ?? [],
    excludePackages: own['exclude-packages'] ?? [],
  };

  for (const entry of [...scope.packages, ...scope.excludePackages]) {
    if (!packages.some(pkg => pkg.component === entry || pkg.path === entry)) {
      throw new ConfigError(
        `${label}: "${entry}" is neither a component name nor a path of a configured package`,
      );
    }
  }

  return scope;
}

const AI_FILE_PLACEHOLDERS = ['${path}', '${component}'];

/** Resolves the `${path}` and `${component}` placeholders of an additional file for a package. */
export function resolveAiFile(
  file: string,
  pkg: Pick<PackageConfig, 'path' | 'component'>,
): string {
  return path.posix.normalize(
    file
      .replaceAll('${path}', () => pkg.path)
      .replaceAll('${component}', () => pkg.component ?? ROOT_KEY),
  );
}

/** Whether an output applies to the package. */
export function aiAppliesTo(
  scope: AiScope,
  pkg: Pick<PackageConfig, 'path' | 'component'>,
): boolean {
  const matches = (entry: string) =>
    entry === pkg.path || entry === pkg.component;

  return (
    (scope.packages.length === 0 || scope.packages.some(matches)) &&
    !scope.excludePackages.some(matches)
  );
}

function parseAiReleaseNotes(
  parsed: ParsedConfig,
  packages: ReadonlyArray<PackageConfig>,
): AiReleaseNotesConfig {
  const {
    'additional-files': additional,
    'changelog': changelogSetting,
    ...shared
  } = parsed['ai-release-notes'];
  const changelogOwn =
    typeof changelogSetting === 'object' ? changelogSetting : {};
  const hasChangelog =
    changelogSetting !== undefined && changelogSetting !== false;

  if (!hasChangelog && additional.length === 0) {
    if (Object.keys(shared).length > 0) {
      throw new ConfigError(
        'ai-release-notes: the options only act as defaults, set "changelog" or at least one entry in "additional-files"',
      );
    }

    return {files: []};
  }

  if (parsed.strategy === 'changesets') {
    throw new ConfigError(
      'ai-release-notes: not supported with strategy changesets yet',
    );
  }

  if (hasChangelog && parsed['rewrite-changelog']) {
    throw new ConfigError(
      'ai-release-notes: the release notes in the changelog cannot be combined with rewrite-changelog, which would drop the release notes of older releases',
    );
  }

  const seen = new Set<string>();
  const files = additional.map(
    ({file, 'file-title': fileTitle, ...own}, index) => {
      const label = `ai-release-notes.additional-files[${index}]`;
      const templated = AI_FILE_PLACEHOLDERS.some(placeholder =>
        file.includes(placeholder),
      );
      const normalized = templated
        ? file
        : normalizeRepoPath(file, `${label}.file`);

      if (templated) {
        normalizeRepoPath(
          resolveAiFile(file, {path: 'pkg', component: 'pkg'}),
          `${label}.file`,
        );
      }

      if (seen.has(normalized)) {
        throw new ConfigError(
          `${label}: the file "${normalized}" is used twice`,
        );
      }

      seen.add(normalized);

      return {
        ...resolveAiSettings(own, shared, label),
        ...parseAiScope(own, packages, label),
        file: normalized,
        fileTitle,
      };
    },
  );

  return {
    ...(hasChangelog
      ? {
          changelog: {
            ...resolveAiSettings(
              changelogOwn,
              shared,
              'ai-release-notes.changelog',
            ),
            ...parseAiScope(
              changelogOwn,
              packages,
              'ai-release-notes.changelog',
            ),
          },
        }
      : {}),
    files,
  };
}

function checkStrategy(raw: unknown, parsed: ParsedConfig): void {
  if (parsed.strategy !== 'changesets' || !raw || typeof raw !== 'object') {
    return;
  }

  const rejected = CHANGESETS_REJECTED_OPTIONS.filter(key => key in raw);

  if (rejected.length > 0) {
    throw new ConfigError(
      `strategy changesets: ${rejected.join(', ')} ${rejected.length === 1 ? 'is' : 'are'} not supported; changesets takes packages, versions and changelogs from the workspace and .changeset/config.json`,
    );
  }
}

export function parseConfig(source: string | undefined): Config {
  const raw = parseYaml(source);
  const parsed = validateSchema(raw);

  checkStrategy(raw, parsed);
  const packages = Object.entries(parsed.packages).map(([rawPath, pkg]) =>
    buildPackage(rawPath, pkg, parsed),
  );

  if (packages.length === 0) {
    throw new ConfigError(`${CONFIG_FILE} must define at least one package`);
  }

  checkUniquePackages(packages);

  const {minorTypes, patchTypes} = parseTypes(parsed);
  const excludePaths = parseExcludePaths(parsed['exclude-paths']);
  const linkedGroups = parseLinkedGroups(parsed['linked-versions'], packages);

  checkTagFormats(packages, linkedGroups, parsed['linked-tags']);
  checkPullRequestSettings(parsed, packages);
  checkComponentUpdaters(parsed, packages);

  const labels = parseLabels(parsed.labels);

  checkReleaseEmoji(parsed);

  return {
    strategy: parsed.strategy,
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
    preCommitScriptTokens: parsed['pre-commit-script-tokens'],
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
    rewriteChangelog: parsed['rewrite-changelog'],
    noChangesText: parsed['no-changes-text'],
    changelogLinks: parsed['changelog-links'],
    changelogLinksText: parsed['changelog-links-text'],
    assignees: parsed.assignees,
    reviewers: parsed.reviewers,
    aiReleaseNotes: parseAiReleaseNotes(parsed, packages),
    httpTimeout: parsed['http-timeout'],
    minorTypes,
    patchTypes,
    excludePaths,
    ...(parsed['bootstrap-sha'] ? {bootstrapSha: parsed['bootstrap-sha']} : {}),
    separatePullRequests: parsed['separate-pull-requests'],
    linkedGroups,
    linkedTags: parsed['linked-tags'],
    packages,
    componentUpdaters: parsed.updaters.map(updater => ({
      type: updater.type,
      path: normalizeRepoPath(updater.path, 'Updater path'),
    })),
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
