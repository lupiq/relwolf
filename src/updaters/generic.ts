import {UpdaterError} from './errors.js';

export const GENERIC_MARKER = 'x-relwolf-version';
export const GENERIC_MINOR_MARKER = 'x-relwolf-minor';
export const GENERIC_MAJOR_MARKER = 'x-relwolf-major';

const NUM = '(?:0|[1-9]\\d*)';
const PRE = '(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)';
const BUILD = '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)';

interface Marker {
  name: string;
  pattern: RegExp;
  /** Pre-releases never move the partial markers (nobody should pin to an unstable major/minor). */
  stableOnly: boolean;
  format: (version: string) => string;
}

const MARKERS: Array<Marker> = [
  {
    name: GENERIC_MARKER,
    pattern: new RegExp(
      `(?<![\\w.+-])(v?)${NUM}\\.${NUM}\\.${NUM}${PRE}?${BUILD}?(?![\\w+-])`,
    ),
    stableOnly: false,
    format: version => version,
  },
  {
    name: GENERIC_MINOR_MARKER,
    pattern: new RegExp(`(?<![\\w.+-])(v?)${NUM}\\.${NUM}(?![\\w+-]|\\.\\d)`),
    stableOnly: true,
    format: version => version.split('.').slice(0, 2).join('.'),
  },
  {
    name: GENERIC_MAJOR_MARKER,
    pattern: new RegExp(`(?<![\\w.+-])(v?)${NUM}(?![\\w+-]|\\.\\d)`),
    stableOnly: true,
    format: version => version.split('.')[0] ?? version,
  },
];

/** A marker counts only at the end of a line (optionally before a closing `-->` or `*\/`), so prose that merely mentions it is ignored. */
const MARKER_AT_END =
  /(?:^|\s)(x-relwolf-(?:version|minor|major))(?:\s*(?:-->|\*\/))?\s*$/;

function markerOf(line: string): Marker | undefined {
  const name = MARKER_AT_END.exec(line)?.[1];

  return MARKERS.find(candidate => candidate.name === name);
}

/**
 * Updates lines that end with a marker (usually placed in a comment). On such a line, the first number of the
 * marker's granularity is replaced and a leading `v` is kept:
 * - `x-relwolf-version`: the full semantic version (`1.2.3`, `1.3.0-beta.1`)
 * - `x-relwolf-minor`: `MAJOR.MINOR` (`1.2`), unchanged for pre-releases
 * - `x-relwolf-major`: `MAJOR` (`1`), unchanged for pre-releases
 */
export function updateGeneric(
  content: string,
  version: string,
  file: string,
): string {
  let found = 0;
  const lines = content.split('\n').map(line => {
    const marker = markerOf(line);

    if (!marker) {
      return line;
    }

    found++;
    const match = marker.pattern.exec(line);

    if (!match) {
      throw new UpdaterError(
        `${file}: line with "${marker.name}" contains no matching version: ${line.trim()}`,
      );
    }

    if (marker.stableOnly && version.includes('-')) {
      return line;
    }

    return (
      line.slice(0, match.index) +
      (match[1] ?? '') +
      marker.format(version) +
      line.slice(match.index + match[0].length)
    );
  });

  if (found === 0) {
    throw new UpdaterError(
      `${file}: no line contains one of the markers ${MARKERS.map(m => `"${m.name}"`).join(', ')}`,
    );
  }

  return lines.join('\n');
}
