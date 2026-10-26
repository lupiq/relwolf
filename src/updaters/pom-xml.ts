import {UpdaterError} from './errors.js';

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)(?:"[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g;

/** Opening and closing tags, without self-closing ones. */
const structuralTags = (content: string): Array<RegExpExecArray> =>
  [...content.matchAll(TOKEN)].filter(
    ([, closing, name, selfClosing]) =>
      name !== undefined && (Boolean(closing) || !selfClosing),
  );

const isProjectVersionTag = (
  name: string | undefined,
  closing: string | undefined,
  depth: number,
): boolean => name === 'version' && depth === (closing ? 2 : 1);

/** Locates the content range of the project's own `<version>` element, or undefined. */
function findProjectVersion(
  content: string,
): {start: number; end: number} | undefined {
  let depth = 0;
  let start = -1;

  for (const match of structuralTags(content)) {
    const [token, closing, name] = match;
    const hit = isProjectVersionTag(name, closing, depth);

    if (closing) {
      if (hit && start >= 0) {
        return {start, end: match.index};
      }

      depth--;
    } else {
      depth++;

      if (hit && start < 0) {
        start = match.index + token.length;
      }
    }
  }

  return undefined;
}

/** Updates the project's own `<version>` (a direct child of `<project>`), not parent or dependency versions. */
export function updatePomXml(
  content: string,
  version: string,
  file: string,
): string {
  const range = findProjectVersion(content);

  if (!range) {
    throw new UpdaterError(
      `${file}: no <version> element found directly under <project>`,
    );
  }

  return content.slice(0, range.start) + version + content.slice(range.end);
}
