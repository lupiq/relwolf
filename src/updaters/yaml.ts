import {UpdaterError} from './errors.js';

const ENTRY = /^(\s*)(?:"([^"]+)"|'([^']+)'|([^\s:#'"-][^:#]*?))\s*:(?:\s+|$)/;
const VALUE = /^("[^"]*"|'[^']*'|[^\s#"'][^#]*?)(\s+#.*)?\s*$/;

/** Replaces the scalar at a dotted key path ("a.b.c") of a block-style YAML file, keeping quotes, comments and layout. */
export function setYamlString(
  content: string,
  key: string,
  value: string,
): string | undefined {
  const parts = key.split('.');
  const lines = content.split('\n');
  const stack: Array<{indent: number; key: string}> = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const entry = ENTRY.exec(line);

    if (!entry || line.trimStart().startsWith('#')) {
      continue;
    }

    const indent = (entry[1] ?? '').length;
    const name = entry[2] ?? entry[3] ?? entry[4] ?? '';

    while (
      stack.length > 0 &&
      (stack[stack.length - 1] as {indent: number}).indent >= indent
    ) {
      stack.pop();
    }

    stack.push({indent, key: name});

    if (
      stack.length !== parts.length ||
      stack.some((item, position) => item.key !== parts[position])
    ) {
      continue;
    }

    const rest = line.slice(entry[0].length);
    const scalar = VALUE.exec(rest);

    if (!scalar) {
      return undefined;
    }

    const raw = scalar[1] ?? '';
    const quote = raw.startsWith('"') || raw.startsWith("'") ? raw[0] : '';

    lines[index] =
      `${line.slice(0, entry[0].length)}${quote}${value}${quote}${scalar[2] ?? ''}`;

    return lines.join('\n');
  }

  return undefined;
}

export function updateYaml(
  content: string,
  version: string,
  file: string,
  key: string,
): string {
  const updated = setYamlString(content, key, version);

  if (updated === undefined) {
    throw new UpdaterError(`${file}: no scalar value "${key}" found`);
  }

  return updated;
}

/** Updates `version` and, if present, `appVersion` of a Helm Chart.yaml. */
export function updateHelm(
  content: string,
  version: string,
  file: string,
): string {
  const updated = updateYaml(content, version, file, 'version');

  return setYamlString(updated, 'appVersion', version) ?? updated;
}
