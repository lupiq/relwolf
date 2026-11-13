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

/**
 * A marker counts only at the end of a line (optionally before a closing `-->` or `*\/`), so prose that merely
 * mentions it is ignored. An optional `:<component>` suffix selects the version of another package.
 */
const MARKER_AT_END =
  /(?:^|\s)(x-relwolf-(?:version|minor|major))(?::([A-Za-z0-9][A-Za-z0-9._-]*))?(?:\s*(?:-->|\*\/))?\s*$/;

function markerOf(
  line: string,
): {marker: Marker; component: string | undefined} | undefined {
  const match = MARKER_AT_END.exec(line);
  const marker = MARKERS.find(candidate => candidate.name === match?.[1]);

  return marker && {marker, component: match?.[2]};
}

function replaceVersion(
  line: string,
  marker: Marker,
  version: string,
  file: string,
  label: string,
): string {
  const match = marker.pattern.exec(line);

  if (!match) {
    throw new UpdaterError(
      `${file}: line with "${label}" contains no matching version: ${line.trim()}`,
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
}

/**
 * Updates lines that end with a marker (usually placed in a comment). On such a line, the first number of the
 * marker's granularity is replaced and a leading `v` is kept:
 * - `x-relwolf-version`: the full semantic version (`1.2.3`, `1.3.0-beta.1`)
 * - `x-relwolf-minor`: `MAJOR.MINOR` (`1.2`), unchanged for pre-releases
 * - `x-relwolf-major`: `MAJOR` (`1`), unchanged for pre-releases
 *
 * Markers with a `:<component>` suffix are left alone; they belong to `updateComponentMarkers`.
 */
export function updateGeneric(
  content: string,
  version: string,
  file: string,
): string {
  let found = 0;
  const lines = content.split('\n').map(line => {
    const parsed = markerOf(line);

    if (!parsed || parsed.component !== undefined) {
      return line;
    }

    found++;

    return replaceVersion(
      line,
      parsed.marker,
      version,
      file,
      parsed.marker.name,
    );
  });

  if (found === 0) {
    throw new UpdaterError(
      `${file}: no line contains one of the markers ${MARKERS.map(m => `"${m.name}"`).join(', ')}`,
    );
  }

  return lines.join('\n');
}

/**
 * Updates lines that end with a component marker (`x-relwolf-version:<component>`, `x-relwolf-minor:<component>`,
 * `x-relwolf-major:<component>`) with the version of that component. Components without a version in `versions`
 * (not released in this run) stay unchanged; components not in `known` and markers without a component fail.
 */
export function updateComponentMarkers(
  content: string,
  versions: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
  file: string,
): {content: string; unreleased: Array<string>} {
  let found = 0;
  const unreleased = new Set<string>();
  const lines = content.split('\n').map(line => {
    const parsed = markerOf(line);

    if (!parsed) {
      return line;
    }

    const {marker, component} = parsed;

    if (component === undefined) {
      throw new UpdaterError(
        `${file}: "${marker.name}" needs a component here ("${marker.name}:<component>"), because the file is listed in the top-level updaters: ${line.trim()}`,
      );
    }

    if (!known.has(component)) {
      throw new UpdaterError(
        `${file}: unknown component "${component}" in "${marker.name}:${component}"; known: ${[...known].join(', ')}`,
      );
    }

    found++;
    const version = versions.get(component);
    const label = `${marker.name}:${component}`;

    if (version === undefined) {
      // Validate the line anyway, so that a broken marker does not wait for the next release of the component.
      replaceVersion(line, marker, '0.0.0', file, label);
      unreleased.add(component);

      return line;
    }

    return replaceVersion(line, marker, version, file, label);
  });

  if (found === 0) {
    throw new UpdaterError(
      `${file}: no line contains a component marker such as "${GENERIC_MARKER}:<component>"`,
    );
  }

  return {content: lines.join('\n'), unreleased: [...unreleased]};
}
