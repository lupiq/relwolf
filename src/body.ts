import {isValidReleaseTag} from './tags.js';

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

export function renderTitle(tags: readonly string[]): string {
  return `chore(release): prepare for ${tags.join(', ')}`;
}

/** Notes come from commit messages, so they must not be able to forge relwolf markers. */
const sanitize = (notes: string): string => notes.replaceAll('<!--', '&lt;!--');

export function renderBody(
  entries: readonly BodyEntry[],
  baseSha: string,
  overrides: readonly BodyOverride[] = [],
): string {
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
  return [
    '🐺 **relwolf** prepared the following release(s). Merging this request tags and publishes them.',
    list,
    ...(overrides.length > 0
      ? [
          'ℹ️ The version was set manually with `RELWOLF_RELEASE_AS`. Run relwolf with `RELWOLF_RELEASE_AS=auto` to return to automatic versioning.',
        ]
      : []),
    '---',
    sections,
    '---',
    ...requested,
    `<!-- relwolf:base ${baseSha} -->`,
  ].join('\n\n');
}

export function parseBody(body: string): BodyEntry[] {
  const entries: BodyEntry[] = [];
  for (const match of body.matchAll(NOTES_PATTERN)) {
    const [, tag = '', prerelease, notes = ''] = match;
    if (!isValidReleaseTag(tag)) continue;
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
