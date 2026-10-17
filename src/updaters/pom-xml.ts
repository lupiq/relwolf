import {UpdaterError} from './errors.js';

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)(?:"[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g;

/** Updates the project's own `<version>` (a direct child of `<project>`), not parent or dependency versions. */
export function updatePomXml(
  content: string,
  version: string,
  file: string,
): string {
  let depth = 0;
  let versionStart = -1;
  let versionEnd = -1;

  for (const match of content.matchAll(TOKEN)) {
    const [token, closing, name, selfClosing] = match;
    if (name === undefined) continue;
    const index = match.index;

    if (closing) {
      if (
        depth === 2 &&
        name === 'version' &&
        versionStart >= 0 &&
        versionEnd < 0
      ) {
        versionEnd = index;
        break;
      }
      depth--;
    } else if (selfClosing) {
      continue;
    } else {
      depth++;
      if (depth === 2 && name === 'version' && versionStart < 0) {
        versionStart = index + token.length;
      }
    }
  }

  if (versionStart < 0 || versionEnd < 0) {
    throw new UpdaterError(
      `${file}: no <version> element found directly under <project>`,
    );
  }
  return content.slice(0, versionStart) + version + content.slice(versionEnd);
}
