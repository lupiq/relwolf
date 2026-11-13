import {applyReleasePlan} from '@changesets/apply-release-plan';
import {assembleReleasePlan} from '@changesets/assemble-release-plan';
import {readConfig} from '@changesets/config';
import {readPreState} from '@changesets/pre';
import {readChangesets} from '@changesets/read';
import type {
  Config as ChangesetsConfig,
  Packages,
  ReleasePlan,
  VersionType,
} from '@changesets/types';
import {getPackages} from '@manypkg/get-packages';
import {stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cliffEnv} from './changelog.js';
import type {PackageConfig} from './config.js';

/** Changesets' default generator; it only re-exports `@changesets/changelog-git`, which relwolf ships. */
const CLI_CHANGELOG = '@changesets/cli/changelog';
const GIT_CHANGELOG = '@changesets/changelog-git';

export class ChangesetsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangesetsError';
  }
}

/** The workspace as changesets sees it, with one relwolf package per versioned package (keyed by its name). */
export interface Workspace {
  packages: Packages;
  config: ChangesetsConfig;
  /** Packages in the format of `relwolf.yaml`: `component` is the package name, tags follow changesets. */
  packageConfigs: Array<PackageConfig>;
  /** Names of the packages that get a tag and a release (private ones only with `privatePackages.tag`). */
  tagged: ReadonlySet<string>;
}

export interface ChangesetsRelease {
  name: string;
  type: Exclude<VersionType, 'none'>;
  oldVersion: string;
  newVersion: string;
  /** Ids of the changesets that mention the package; empty if it is only released because of a dependency. */
  changesets: Array<string>;
  pkg: PackageConfig;
  tagged: boolean;
}

export interface ChangesetsPlan {
  releasePlan: ReleasePlan;
  releases: Array<ChangesetsRelease>;
}

const exists = async (file: string): Promise<boolean> =>
  Boolean(await stat(file).catch(() => undefined));

const toPosix = (value: string): string => value.split(path.sep).join('/');

export async function loadWorkspace(cwd: string): Promise<Workspace> {
  if (!(await exists(path.join(cwd, '.changeset', 'config.json')))) {
    throw new ChangesetsError(
      'strategy changesets: .changeset/config.json is missing; run "npx @changesets/cli init" and commit the result.',
    );
  }

  let packages: Packages;

  try {
    packages = await getPackages(cwd);
  } catch (error) {
    throw new ChangesetsError(
      `strategy changesets: cannot read the packages of the workspace: ${(error as Error).message}`,
    );
  }

  const result = await readConfig(packages.rootDir, packages);

  if (result.errors) {
    throw new ChangesetsError(
      `Invalid .changeset/config.json:\n${result.errors.map(error => `  - ${error}`).join('\n')}`,
    );
  }

  const {config} = result;
  const single = packages.tool.type === 'root';
  const packageConfigs: Array<PackageConfig> = [];
  const tagged = new Set<string>();

  for (const pkg of packages.packages) {
    const {name} = pkg.packageJson;
    const dir = toPosix(path.relative(cwd, pkg.dir)) || '.';

    if (dir === '..' || dir.startsWith('../')) {
      throw new ChangesetsError(
        `strategy changesets: the package ${name} lies outside the repository (${pkg.dir}).`,
      );
    }

    packageConfigs.push({
      path: dir,
      component: name,
      changelogPath: dir === '.' ? 'CHANGELOG.md' : `${dir}/CHANGELOG.md`,
      updaters: [],
      minorPreMajor: true,
      tagPrefix: single ? 'v' : `${name}@`,
      tagSuffix: '',
    });

    if (!pkg.packageJson.private || config.privatePackages.tag) {
      tagged.add(name);
    }
  }

  return {packages, config, packageConfigs, tagged};
}

/** Mirrors `changeset version`: the releases of the pending changesets, or none if there is nothing to release. */
export async function readReleasePlan(
  workspace: Workspace,
  log: (message: string) => void,
): Promise<ChangesetsPlan | undefined> {
  const {rootDir} = workspace.packages;
  const [changesets, preState] = await Promise.all([
    readChangesets(rootDir),
    readPreState(rootDir),
  ]);

  if (preState?.mode === 'pre') {
    log(
      `Changesets is in pre-release mode "${preState.tag}" (.changeset/pre.json); run "changeset pre exit" for a stable release.`,
    );
  } else if (preState?.mode === 'exit') {
    log('Changesets leaves pre-release mode with this release.');
  }

  if (changesets.length === 0 && preState?.mode !== 'exit') {
    log('No pending changesets in .changeset.');

    return undefined;
  }

  log(`Found ${changesets.length} pending changeset(s).`);

  const releasePlan = assembleReleasePlan(
    changesets,
    workspace.packages,
    workspace.config,
    preState,
  );
  const byName = new Map(
    workspace.packageConfigs.map(pkg => [pkg.component, pkg]),
  );
  const releases: Array<ChangesetsRelease> = [];

  for (const release of releasePlan.releases) {
    const pkg = byName.get(release.name);

    if (
      release.type === 'none' ||
      release.oldVersion === release.newVersion ||
      !pkg
    ) {
      continue;
    }

    releases.push({
      name: release.name,
      type: release.type,
      oldVersion: release.oldVersion,
      newVersion: release.newVersion,
      changesets: release.changesets,
      pkg,
      tagged: workspace.tagged.has(release.name),
    });
  }

  for (const release of releases) {
    log(describeRelease(release));
  }

  return {releasePlan, releases};
}

function describeRelease(release: ChangesetsRelease): string {
  const reason =
    release.changesets.length === 0
      ? 'dependency update'
      : `${release.changesets.length} changeset(s)`;
  const untagged = release.tagged ? '' : '; private, no tag and release';

  return `[${release.name}] ${release.type} ${release.oldVersion} -> ${release.newVersion} (${reason}${untagged}).`;
}

/** Whether the generator can be imported from the repository, the way changesets resolves it first. */
function resolvableFromRepo(rootDir: string, specifier: string): boolean {
  try {
    createRequire(path.join(rootDir, '.changeset', 'x.js')).resolve(specifier);

    return true;
  } catch {
    return false;
  }
}

/** The changesets config used to write the files: no formatter (it would run the package manager). */
function applyConfig(
  workspace: Workspace,
  log: (message: string) => void,
): ChangesetsConfig {
  const {config, packages} = workspace;
  let {changelog} = config;

  if (
    changelog &&
    changelog[0] === CLI_CHANGELOG &&
    !resolvableFromRepo(packages.rootDir, CLI_CHANGELOG)
  ) {
    changelog = [GIT_CHANGELOG, changelog[1]];
  }

  if (config.format !== false && config.format !== 'auto') {
    log(
      `Ignoring "format": "${config.format}" of .changeset/config.json; format the files in the pre-commit-script instead.`,
    );
  }

  return {...config, changelog, format: false};
}

/**
 * Lets changesets write the release into the working tree: versions (including dependents), changelogs, consumed
 * changesets and the pre-release state. Generators are resolved from the repository first, then from relwolf.
 */
export async function applyChangesets(
  workspace: Workspace,
  plan: ChangesetsPlan,
  env: NodeJS.ProcessEnv,
  log: (message: string) => void,
): Promise<void> {
  const contextDir = path.dirname(fileURLToPath(import.meta.url));
  const config = applyConfig(workspace, log);
  // @changesets/changelog-github reads the token from the process environment.
  const token = cliffEnv(env).GITHUB_TOKEN;
  const previous = process.env.GITHUB_TOKEN;
  const injected = Boolean(token) && previous === undefined;

  if (injected) {
    process.env.GITHUB_TOKEN = token;
  }

  try {
    await applyReleasePlan(
      plan.releasePlan,
      workspace.packages,
      config,
      undefined,
      contextDir,
    );
  } catch (error) {
    throw new ChangesetsError(
      `Changesets could not apply the release: ${(error as Error).message}`,
    );
  } finally {
    if (injected) {
      delete process.env.GITHUB_TOKEN;
    }
  }
}

const HEADING = /^##\s+(.*?)\s*$/;

/** The section changesets added to a changelog for `version`, without its heading. */
export function extractNotes(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => HEADING.exec(line)?.[1] === version);

  if (start === -1) {
    return '';
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => HEADING.test(line));

  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}
