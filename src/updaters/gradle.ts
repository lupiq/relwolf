import { UpdaterError } from "./errors.js";

const GROOVY_KOTLIN = /^(version\s*(?:=\s*|\s+))(["'])[^"'\n]*\2/m;
const PROPERTIES = /^(version\s*[=:]\s*)\S.*$/m;

/**
 * Supports a top-level `version = "1.2.3"` / `version '1.2.3'` in build.gradle(.kts)
 * and `version=1.2.3` in gradle.properties.
 */
export function updateGradle(content: string, version: string, file: string): string {
  const properties = file.endsWith(".properties");
  const pattern = properties ? PROPERTIES : GROOVY_KOTLIN;
  if (!pattern.test(content)) {
    throw new UpdaterError(`${file}: no top-level version assignment found`);
  }
  return properties
    ? content.replace(PROPERTIES, (_whole, prefix: string) => `${prefix}${version}`)
    : content.replace(GROOVY_KOTLIN, (_whole, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`);
}
