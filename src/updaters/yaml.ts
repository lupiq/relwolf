import {UpdaterError} from './errors.js';

const ENTRY = /^(\s*)(?:"([^"]+)"|'([^']+)'|([^\s:#'"-][^:#]*?))\s*:(?:\s+|$)/;
const VALUE = /^("[^"]*"|'[^']*'|[^\s#"'][^#]*?)(\s+#.*)?\s*$/;

/** Replaces the scalar after `prefixLength` in `line`, keeping quotes and trailing comment; undefined if not a scalar. */
function replaceScalar(
  line: string,
  prefixLength: number,
  value: string,
): string | undefined {
  const scalar = VALUE.exec(line.slice(prefixLength));

  if (!scalar) {
    return undefined;
  }

  const raw = scalar[1] ?? '';
  const quote = raw.startsWith('"') || raw.startsWith("'") ? raw[0] : '';

  return `${line.slice(0, prefixLength)}${quote}${value}${quote}${scalar[2] ?? ''}`;
}

/** Pops finished parents, then pushes the entry, so the stack is the key path of the current line. */
function pushEntry(
  stack: Array<{indent: number; key: string}>,
  entry: RegExpExecArray,
): void {
  const indent = (entry[1] ?? '').length;
  const key = entry[2] ?? entry[3] ?? entry[4] ?? '';

  while ((stack.at(-1)?.indent ?? -1) >= indent) {
    stack.pop();
  }

  stack.push({indent, key});
}

const matchesPath = (
  stack: ReadonlyArray<{key: string}>,
  parts: ReadonlyArray<string>,
): boolean =>
  stack.length === parts.length &&
  stack.every((item, i) => item.key === parts[i]);

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

    pushEntry(stack, entry);

    if (matchesPath(stack, parts)) {
      const replaced = replaceScalar(line, entry[0].length, value);

      if (replaced === undefined) {
        return undefined;
      }

      lines[index] = replaced;

      return lines.join('\n');
    }
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
