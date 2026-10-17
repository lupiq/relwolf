import { UpdaterError } from "./errors.js";

export const GENERIC_MARKER = "x-relwolf-version";

const VERSION_IN_LINE =
  /(?<![\w.+-])(v?)(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\w+-])/;

/**
 * Replaces the first semantic version on every line containing the marker
 * `x-relwolf-version` (usually placed in a comment). A leading `v` is kept.
 */
export function updateGeneric(content: string, version: string, file: string): string {
  let replaced = 0;
  const lines = content.split("\n").map((line) => {
    if (!line.includes(GENERIC_MARKER)) return line;
    const match = VERSION_IN_LINE.exec(line);
    if (!match) {
      throw new UpdaterError(`${file}: line with "${GENERIC_MARKER}" contains no version: ${line.trim()}`);
    }
    replaced++;
    return line.slice(0, match.index) + (match[1] ?? "") + version + line.slice(match.index + match[0].length);
  });
  if (replaced === 0) {
    throw new UpdaterError(`${file}: no line contains the marker "${GENERIC_MARKER}"`);
  }
  return lines.join("\n");
}
