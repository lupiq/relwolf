import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './git.js';
import {detectProvider} from './providers/index.js';

export interface CliffInvocation {
  /** Repository working directory. */
  cwd: string;
  /** Optional git-cliff config path (repository-relative). */
  configPath?: string | undefined;
  /** Git revision range, e.g. "v1.0.0..HEAD". Whole history when omitted. */
  range?: string | undefined;
  /** Tag name to assign to the unreleased commits. */
  tag: string;
  /** Regex of the tags that delimit releases. */
  tagPattern: string;
  includePath?: string | undefined;
  excludePaths: Array<string>;
  /** Commits to leave out of the changelog, e.g. reverted ones. */
  skipCommits?: Array<string> | undefined;
  /** Render all releases of the range instead of only the unreleased commits. */
  all?: boolean | undefined;
}

function resolveCliffCommand(env: NodeJS.ProcessEnv): {
  command: string;
  prefix: Array<string>;
} {
  if (env.RELWOLF_GIT_CLIFF) {
    return {command: env.RELWOLF_GIT_CLIFF, prefix: []};
  }

  const script = fileURLToPath(import.meta.resolve('git-cliff/cli'));

  return {command: process.execPath, prefix: [script]};
}

function baseArgs(options: CliffInvocation): Array<string> {
  const args: Array<string> = [];

  if (options.range) {
    args.push(options.range);
  } else if (!options.all) {
    args.push('--unreleased');
  }

  args.push('--tag', options.tag, '--tag-pattern', options.tagPattern);

  if (options.configPath) {
    args.push('--config', options.configPath);
  }

  if (options.includePath) {
    args.push('--include-path', options.includePath);
  }

  for (const exclude of options.excludePaths) {
    args.push('--exclude-path', exclude);
  }

  for (const sha of options.skipCommits ?? []) {
    args.push('--skip-commit', sha);
  }

  return args;
}

/**
 * Environment for git-cliff: lets its GitLab/GitHub integration (`remote` context) reuse RELWOLF_TOKEN.
 * Variables set by the user take precedence.
 */
export function cliffEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const token = env.RELWOLF_TOKEN;

  if (!token) {
    return env;
  }

  if (detectProvider(env) === 'gitlab') {
    return {
      ...env,
      GITLAB_TOKEN: env.GITLAB_TOKEN ?? token,
      ...(env.CI_API_V4_URL && !env.GITLAB_API_URL
        ? {GITLAB_API_URL: env.CI_API_V4_URL}
        : {}),
    };
  }

  return {...env, GITHUB_TOKEN: env.GITHUB_TOKEN ?? token};
}

async function cliff(
  options: CliffInvocation,
  extra: Array<string>,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const {command, prefix} = resolveCliffCommand(env);

  return run(
    command,
    [...prefix, ...baseArgs(options), ...extra],
    options.cwd,
    cliffEnv(env),
  );
}

/** Release notes for a single release (without header and footer). */
export async function generateNotes(
  options: CliffInvocation,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return (await cliff(options, ['--strip', 'all'], env)).trim();
}

function commonSuffixLength(a: string, b: string): number {
  let length = 0;

  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length++;
  }

  return length;
}

/** Returns `existing` with the new release entry prepended, following the user's git-cliff config. */
export async function prependToChangelog(
  options: CliffInvocation,
  existing: string,
  env: NodeJS.ProcessEnv = process.env,
  /** Text added below the new entry, for releases without any change. */
  placeholder?: string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'relwolf-'));
  const file = path.join(dir, 'CHANGELOG.md');

  try {
    await writeFile(file, existing);
    await cliff(options, ['--prepend', file], env);

    const result = await readFile(file, 'utf8');

    if (!placeholder) {
      return result;
    }

    // git-cliff removes the old header before prepending, so the old entries are only a suffix of `existing`.
    const kept = commonSuffixLength(result, existing);
    const added = result.slice(0, result.length - kept).trimEnd();
    const rest = result.slice(result.length - kept).trimStart();

    return `${added}\n\n${placeholder}\n\n${rest}`.trimEnd() + '\n';
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

/**
 * Makes the changelog title package specific without touching the git-cliff config:
 * `${component}` is replaced everywhere (usable in the cliff header), and `title` replaces a leading
 * first-level heading.
 */
export function applyChangelogTitle(
  changelog: string,
  component: string,
  title?: string,
): string {
  const replaced = changelog.replaceAll('${component}', component);

  if (!title) {
    return replaced;
  }

  const heading = `# ${title.replaceAll('${component}', component)}`;

  return replaced.replace(/^(\s*)# .*/, (_, lead: string) => lead + heading);
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LINKS_START = '<!-- relwolf:changelog-links:start -->';
const LINKS_END = '<!-- relwolf:changelog-links:end -->';

/** A link to the changelog of another package. */
export interface ChangelogLink {
  label: string;
  /** Path relative to the changelog the link is written to. */
  href: string;
}

/**
 * Writes a block with links to other changelogs below the leading first-level heading (or at the top without one).
 * An existing block is replaced, so repeated runs do not duplicate it.
 */
export function applyChangelogLinks(
  changelog: string,
  text: string,
  links: ReadonlyArray<ChangelogLink>,
): string {
  const start = escapeRegex(LINKS_START);
  const end = escapeRegex(LINKS_END);
  const without = changelog.replace(
    new RegExp(`${start}[\\s\\S]*?${end}\\s*`, 'g'),
    '',
  );

  if (links.length === 0) {
    return without;
  }

  const list = links.map(link => `- [${link.label}](${link.href})`);
  const block = [LINKS_START, text, '', ...list, LINKS_END].join('\n');
  const heading = /^(\s*# .*\n)\s*/.exec(without);

  if (!heading) {
    return `${block}\n\n${without.trimStart()}`;
  }

  return `${heading[1]}\n${block}\n\n${without.slice(heading[0].length)}`;
}

/** One release of a rewritten changelog. */
export interface RewriteRelease {
  tag: string;
  /** The release before it, if any; git-cliff otherwise links the newest release as its predecessor. */
  previous?: string | undefined;
  /** Git revision range of the release. */
  range: string;
  /** Commits of the package in the range. */
  commits: ReadonlyArray<string>;
  /** Whether the entry gets the placeholder if no commit shows up in it. */
  placeholder: boolean;
  /** Whether the release gets `RELWOLF_RELEASE_EMOJI`; older releases render without it. */
  emoji?: boolean | undefined;
}

type Strip = 'header' | 'footer' | 'all';

function stripFor(keepHeader: boolean, keepFooter: boolean): Strip | undefined {
  if (keepHeader) {
    return keepFooter ? undefined : 'footer';
  }

  return keepFooter ? 'header' : 'all';
}

/**
 * Renders the complete changelog from the history, including the new entry.
 *
 * With `releases` (newest first), every release is rendered on its own: git-cliff does not recognise tags on
 * commits that do not touch the package (and omits releases without any commit), so a single render would
 * move changes between releases and drop releases without changes.
 */
export async function rewriteChangelog(
  options: CliffInvocation,
  env: NodeJS.ProcessEnv = process.env,
  releases: ReadonlyArray<RewriteRelease> = [],
  placeholder = '',
): Promise<string> {
  if (releases.length === 0) {
    return renderAll(options, env);
  }

  const rendered: Array<string> = [];

  for (const [index, release] of releases.entries()) {
    const strip = stripFor(index === 0, index === releases.length - 1);
    const render = (skip: ReadonlyArray<string>): Promise<string> =>
      cliff(
        {
          ...options,
          range: release.range,
          tag: release.tag,
          // Only the previous release counts, otherwise git-cliff links the newest one.
          tagPattern: release.previous
            ? `^${escapeRegex(release.previous)}$`
            : '^$',
          all: true,
          skipCommits: [...(options.skipCommits ?? []), ...skip],
        },
        strip ? ['--strip', strip] : [],
        release.emoji ? env : {...env, RELWOLF_RELEASE_EMOJI: ''},
      );
    const text = await render([]);

    // The entry of a release in which every commit is left out by the git-cliff config looks like one without commits.
    const empty =
      release.placeholder &&
      (release.commits.length === 0 ||
        text === (await render(release.commits)));

    if (!empty) {
      rendered.push(text);
      continue;
    }

    const entry = text.trimEnd();

    rendered.push(
      placeholder ? `${entry}\n\n${placeholder}\n\n` : `${entry}\n`,
    );
  }

  return rendered.join('');
}

async function renderAll(
  options: CliffInvocation,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'relwolf-'));
  const file = path.join(dir, 'CHANGELOG.md');

  try {
    await cliff({...options, all: true}, ['--output', file], env);

    return await readFile(file, 'utf8');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
