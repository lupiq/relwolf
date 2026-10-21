import {UpdaterError} from './errors.js';

function parse(content: string, file: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new UpdaterError(
      `${file}: invalid JSON: ${(error as Error).message}`,
    );
  }
}

function serialize(data: unknown, original: string): string {
  const indent = /^[ \t]+(?=")/m.exec(original)?.[0] ?? '  ';

  return (
    JSON.stringify(data, null, indent) + (original.endsWith('\n') ? '\n' : '')
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sets the string at a dotted key path ("a.b.c") in a JSON document, keeping indentation and trailing newline. */
export function updateJson(
  content: string,
  version: string,
  file: string,
  key: string,
): string {
  const data = parse(content, file);
  const parts = key.split('.');
  let node: unknown = data;

  for (const part of parts.slice(0, -1)) {
    node = isObject(node) ? node[part] : undefined;
  }

  const last = parts[parts.length - 1] ?? '';

  if (!isObject(node) || !(last in node)) {
    throw new UpdaterError(`${file}: no "${key}" field found`);
  }

  node[last] = version;

  return serialize(data, content);
}

/** Updates the version of the root package in package-lock.json / npm-shrinkwrap.json (both places it occurs). */
export function updatePackageLock(
  content: string,
  version: string,
  file: string,
): string {
  const data = parse(content, file);

  if (!isObject(data) || typeof data.version !== 'string') {
    throw new UpdaterError(`${file}: no top-level "version" field found`);
  }

  data.version = version;

  const root = isObject(data.packages) ? data.packages[''] : undefined;

  if (isObject(root) && 'version' in root) {
    root.version = version;
  }

  return serialize(data, content);
}
