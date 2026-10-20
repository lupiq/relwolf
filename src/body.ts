export const LABEL_PENDING = 'relwolf: pending';
export const LABEL_TAGGED = 'relwolf: tagged';

export interface BodyEntry {
  tag: string;
  prerelease: boolean;
  notes: string;
}

export interface BodyOverride {
  /** Component of the package, "" for the package without one. */
  component: string;
  version: string;
}

const OVERRIDE_PATTERN =
  /<!-- relwolf:release-as component="([A-Za-z0-9._-]*)" version="([^"\s]+)" -->/g;

const NOTES_PATTERN =
  /<!-- relwolf:notes tag="([^"\s]+)" prerelease="(true|false)" -->\r?\n([\s\S]*?)\r?\n<!-- \/relwolf:notes -->/g;

export const DEFAULT_TITLE_TEMPLATE = 'chore(release): Create release ${tags}';

/** Placeholders: `${tags}` (all tags, comma separated) and `${version}` (the bare version for a single package, else the tags). */
export function renderTitle(
  tags: readonly string[],
  template = DEFAULT_TITLE_TEMPLATE,
  versions: readonly string[] = tags,
): string {
  const tagList = tags.join(', ');
  const version = (versions.length === 1 ? versions[0] : undefined) ?? tagList;

  return template
    .replaceAll('${tags}', () => tagList)
    .replaceAll('${version}', () => version);
}

/** Notes come from commit messages, so they must not be able to forge relwolf markers. */
const sanitize = (notes: string): string => notes.replaceAll('<!--', '&lt;!--');

export const DEFAULT_BODY_TEMPLATE = [
  '🐺 **relwolf** prepared the following release(s). Merging this request tags and publishes them.',
  '${releases}',
  '${hint}',
  '---',
  '${notes}',
  '---',
].join('\n\n');

const HINT =
  'ℹ️ The version was set manually with `RELWOLF_RELEASE_AS`. Run relwolf with `RELWOLF_RELEASE_AS=auto` to return to automatic versioning.';

export interface RenderBodyOptions {
  /** Template with the placeholders `${tags}`, `${version}`, `${releases}`, `${hint}` and `${notes}`. */
  template?: string | undefined;
  /** Bare versions, for the `${version}` placeholder. */
  versions?: readonly string[] | undefined;
}

/** The relwolf markers (notes, requested versions, base commit) are always part of the body, whatever the template. */
export function renderBody(
  entries: readonly BodyEntry[],
  baseSha: string,
  overrides: readonly BodyOverride[] = [],
  options: RenderBodyOptions = {},
): string {
  const tags = entries.map(entry => entry.tag);
  const list = entries
    .map(
      entry => `- \`${entry.tag}\`${entry.prerelease ? ' (pre-release)' : ''}`,
    )
    .join('\n');
  const sections = entries
    .map(
      entry =>
        `<!-- relwolf:notes tag="${entry.tag}" prerelease="${entry.prerelease}" -->\n${sanitize(entry.notes)}\n<!-- /relwolf:notes -->`,
    )
    .join('\n\n');
  const requested = overrides.map(
    override =>
      `<!-- relwolf:release-as component="${override.component}" version="${override.version}" -->`,
  );
  const tagList = tags.join(', ');
  const versions = options.versions ?? tags;
  const version = (versions.length === 1 ? versions[0] : undefined) ?? tagList;
  const fill = (part: string): string =>
    part
      .replaceAll('${tags}', () => tagList)
      .replaceAll('${version}', () => version)
      .replaceAll('${releases}', () => list)
      .replaceAll('${hint}', () => (overrides.length > 0 ? HINT : ''))
      .replace(/\n{3,}/g, '\n\n');
  const [before = '', after = ''] = (
    options.template ?? DEFAULT_BODY_TEMPLATE
  ).split('${notes}');

  return [
    fill(before) + sections + fill(after),
    ...requested,
    `<!-- relwolf:base ${baseSha} -->`,
  ].join('\n\n');
}

export function parseBody(
  body: string,
  isValidTag: (tag: string) => boolean,
): BodyEntry[] {
  const entries: BodyEntry[] = [];

  for (const match of body.matchAll(NOTES_PATTERN)) {
    const [, tag = '', prerelease, notes = ''] = match;

    if (!isValidTag(tag)) {
      continue;
    }

    entries.push({tag, prerelease: prerelease === 'true', notes});
  }

  return entries;
}

export function parseOverrides(body: string): BodyOverride[] {
  return [...body.matchAll(OVERRIDE_PATTERN)].map(match => ({
    component: match[1] ?? '',
    version: match[2] ?? '',
  }));
}

/** Placeholders: `${tag}`, `${version}` (without prefix) and `${component}` (empty without component). */
export function renderReleaseName(
  template: string,
  values: {tag: string; version: string; component?: string | undefined},
): string {
  return template
    .replaceAll('${tag}', () => values.tag)
    .replaceAll('${version}', () => values.version)
    .replaceAll('${component}', () => values.component ?? '');
}
