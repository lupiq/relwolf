import {isValidReleaseTag} from './tags.js';

export const LABEL_PENDING = 'relwolf: pending';
export const LABEL_TAGGED = 'relwolf: tagged';

export interface BodyEntry {
  tag: string;
  prerelease: boolean;
  notes: string;
}

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
  return [
    '🐺 **relwolf** prepared the following release(s). Merging this request tags and publishes them.',
    list,
    '---',
    sections,
    '---',
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
