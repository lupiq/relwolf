import {UpdaterError} from './errors.js';

const SECTION = /^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/;
const ARRAY_SECTION = /^\s*\[\[/;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces a single-line string value of `key` inside `section` ("" for the top level). Returns undefined if absent. */
export function setTomlString(
  content: string,
  section: string,
  key: string,
  value: string,
): string | undefined {
  const lines = content.split('\n');
  const assignment = new RegExp(
    `^(\\s*${escape(key)}\\s*=\\s*)(["'])[^"'\\n]*\\2`,
  );
  let current = '';

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';

    if (ARRAY_SECTION.test(line)) {
      current = '[[]]';
      continue;
    }

    const header = SECTION.exec(line);

    if (header) {
      current = (header[1] ?? '').replace(/\s*\.\s*/g, '.');
      continue;
    }

    if (current !== section) {
      continue;
    }

    const match = assignment.exec(line);

    if (match) {
      lines[index] =
        `${match[1]}${match[2]}${value}${match[2]}${line.slice(match[0].length)}`;

      return lines.join('\n');
    }
  }

  return undefined;
}

/** Updates a dotted key path such as `package.version` in a TOML file; formatting and comments stay untouched. */
export function updateToml(
  content: string,
  version: string,
  file: string,
  key: string,
): string {
  const parts = key.split('.');
  const last = parts.pop() ?? '';
  const updated = setTomlString(content, parts.join('.'), last, version);

  if (updated === undefined) {
    throw new UpdaterError(`${file}: no string value "${key}" found`);
  }

  return updated;
}

/** Updates `[project] version` (PEP 621) or `[tool.poetry] version`. */
export function updatePyproject(
  content: string,
  version: string,
  file: string,
): string {
  const updated =
    setTomlString(content, 'project', 'version', version) ??
    setTomlString(content, 'tool.poetry', 'version', version);

  if (updated === undefined) {
    throw new UpdaterError(
      `${file}: no static version in [project] or [tool.poetry] found (a dynamic version cannot be updated)`,
    );
  }

  return updated;
}

/** Updates `[package] version`, or `[workspace.package] version` for workspace roots. */
export function updateCargo(
  content: string,
  version: string,
  file: string,
): string {
  const updated =
    setTomlString(content, 'package', 'version', version) ??
    setTomlString(content, 'workspace.package', 'version', version);

  if (updated === undefined) {
    throw new UpdaterError(
      `${file}: no version in [package] or [workspace.package] found`,
    );
  }

  return updated;
}

/** Name of the crate in a Cargo.toml, if any. */
export function cargoName(content: string): string | undefined {
  let inPackage = false;

  for (const line of content.split('\n')) {
    const header = SECTION.exec(line);

    if (header || ARRAY_SECTION.test(line)) {
      inPackage = header?.[1] === 'package';
      continue;
    }

    const name = inPackage
      ? /^\s*name\s*=\s*["']([^"']+)["']/.exec(line)
      : null;

    if (name) {
      return name[1];
    }
  }

  return undefined;
}

/** Updates the entry of the own crate in Cargo.lock. */
export function updateCargoLock(
  content: string,
  version: string,
  file: string,
  name: string,
): string {
  const pattern = new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname = "${escape(name)}"\\r?\\nversion = ")[^"\\n]*"`,
  );

  if (!pattern.test(content)) {
    throw new UpdaterError(`${file}: no entry for "${name}" found`);
  }

  return content.replace(
    pattern,
    (_whole, prefix: string) => `${prefix}${version}"`,
  );
}
