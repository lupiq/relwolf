import {UpdaterError} from './errors.js';

const VERSION = /(<Version>\s*)[^<\s][^<]*?(\s*<\/Version>)/;

/** Updates the first `<Version>` element of a .csproj / Directory.Build.props file. */
export function updateDotnet(
  content: string,
  version: string,
  file: string,
): string {
  if (!VERSION.test(content)) {
    throw new UpdaterError(`${file}: no <Version> element found`);
  }

  return content.replace(
    VERSION,
    (_whole, open: string, close: string) => `${open}${version}${close}`,
  );
}
