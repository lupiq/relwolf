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

const REVERT_HEADER = /^Revert "(.+)"$/;
const REVERTS_SHA = /This reverts commit ([0-9a-f]{7,40})/i;

interface MessageCommit {
  sha: string;
  message: string;
}

/**
 * Drops commits that were reverted within the same list, together with the revert commits themselves.
 * `commits` is newest first. A revert is matched by the sha in git's "This reverts commit" line or, because
 * squash merges drop that line, by the quoted subject of the nearest older commit.
 */
export function splitReverted<T extends MessageCommit>(
  commits: readonly T[],
): {kept: T[]; dropped: T[]} {
  const subject = (c: T) => c.message.trim().split('\n')[0] ?? '';
  const target = new Map<number, number>();
  commits.forEach((commit, index) => {
    const header = REVERT_HEADER.exec(subject(commit));
    if (!header) return;
    const sha = REVERTS_SHA.exec(commit.message)?.[1]?.toLowerCase();
    for (const [older, candidate] of commits.entries()) {
      if (older <= index) continue;
      const matches = sha
        ? candidate.sha.toLowerCase().startsWith(sha)
        : subject(candidate) === header[1];
      if (matches) {
        target.set(index, older);
        return;
      }
    }
  });

  // Newest first: a revert only takes effect if it was not reverted itself.
  const dropped = new Set<number>();
  commits.forEach((commit, index) => {
    if (REVERT_HEADER.test(subject(commit))) dropped.add(index);
  });
  const effective = new Set<number>();
  for (let index = 0; index < commits.length; index++) {
    const reverted = [...target].some(
      ([revert, victim]) => victim === index && effective.has(revert),
    );
    if (!reverted && target.has(index)) effective.add(index);
    if (reverted) dropped.add(index);
  }
  return {
    kept: commits.filter((_, index) => !dropped.has(index)),
    dropped: commits.filter((_, index) => dropped.has(index)),
  };
}

export function withoutReverted<T extends MessageCommit>(
  commits: readonly T[],
): T[] {
  return splitReverted(commits).kept;
}
