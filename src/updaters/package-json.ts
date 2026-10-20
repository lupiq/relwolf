import {UpdaterError} from './errors.js';

/** Updates the top-level `"version"` field while preserving indentation and the trailing newline. */
export function updatePackageJson(
  content: string,
  version: string,
  file: string,
): string {
  let data: unknown;

  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new UpdaterError(
      `${file}: invalid JSON: ${(error as Error).message}`,
    );
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    !('version' in data)
  ) {
    throw new UpdaterError(`${file}: no top-level "version" field found`);
  }

  (data as {version: string}).version = version;
  const indent = /^[ \t]+(?=")/m.exec(content)?.[0] ?? '  ';

  return (
    JSON.stringify(data, null, indent) + (content.endsWith('\n') ? '\n' : '')
  );
}
