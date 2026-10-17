import type {BumpLevel} from './version.js';

export interface ConventionalCommit {
  sha: string;
  type: string;
  scope?: string;
  description: string;
  breaking: boolean;
}

const HEADER = /^(\w+)(?:\(([^)\n]*)\))?(!)?:[ \t]+(\S.*)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE(?:\([^)\n]*\))?:[ \t]*\S/m;

export function parseCommit(
  sha: string,
  message: string,
): ConventionalCommit | null {
  const [header = '', ...rest] = message
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const match = HEADER.exec(header);
  if (!match) return null;
  const [, type = '', scope, bang, description = ''] = match;
  const commit: ConventionalCommit = {
    sha,
    type: type.toLowerCase(),
    description: description.trim(),
    breaking: bang === '!' || BREAKING_FOOTER.test(rest.join('\n')),
  };
  if (scope) commit.scope = scope;
  return commit;
}

export function bumpLevel(
  commits: readonly ConventionalCommit[],
): BumpLevel | null {
  let level: BumpLevel | null = null;
  for (const commit of commits) {
    if (commit.breaking) return 'major';
    if (commit.type === 'feat') level = 'minor';
    else if (commit.type === 'fix' && level === null) level = 'patch';
  }
  return level;
}
