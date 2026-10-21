import {updateJson} from './json.js';

/** Updates the top-level `"version"` field while preserving indentation and the trailing newline. */
export function updatePackageJson(
  content: string,
  version: string,
  file: string,
): string {
  return updateJson(content, version, file, 'version');
}
