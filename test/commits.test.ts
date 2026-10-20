import {describe, expect, it} from 'vitest';
import {bumpLevel, parseCommit, withoutReverted} from '../src/commits.js';

describe('parseCommit', () => {
  it('parses type, scope and description', () => {
    expect(parseCommit('a', 'feat(api): add endpoint')).toEqual({
      sha: 'a',
      type: 'feat',
      scope: 'api',
      description: 'add endpoint',
      breaking: false,
    });
  });

  it('detects breaking changes via ! and via footer', () => {
    expect(parseCommit('a', 'feat!: drop node 18')?.breaking).toBe(true);
    expect(parseCommit('a', 'fix(core)!: change api')?.breaking).toBe(true);
    expect(
      parseCommit('a', 'fix: x\n\nbody\n\nBREAKING CHANGE: removed y')
        ?.breaking,
    ).toBe(true);
    expect(
      parseCommit('a', 'fix: x\n\nBREAKING-CHANGE: removed y')?.breaking,
    ).toBe(true);
  });

  it('ignores BREAKING CHANGE text in the header or without description', () => {
    expect(parseCommit('a', 'fix: BREAKING CHANGE: nope')?.breaking).toBe(
      false,
    );
    expect(parseCommit('a', 'fix: x\n\nBREAKING CHANGE:')?.breaking).toBe(
      false,
    );
  });

  it('returns null for non-conventional messages', () => {
    expect(parseCommit('a', 'Update readme')).toBeNull();
    expect(parseCommit('a', 'feat:missing space')).toBeNull();
    expect(parseCommit('a', '')).toBeNull();
  });

  it('lowercases the type and handles CRLF', () => {
    expect(
      parseCommit('a', 'Fix: Something\r\n\r\nBREAKING CHANGE: x'),
    ).toMatchObject({type: 'fix', breaking: true});
  });
});

describe('bumpLevel', () => {
  const commits = (...messages: string[]) =>
    messages
      .map((message, i) => parseCommit(String(i), message)!)
      .filter(Boolean);

  it('is null for non-releasable commits', () => {
    expect(
      bumpLevel(commits('chore: x', 'docs: y', 'refactor: z', 'perf: p')),
    ).toBeNull();
    expect(bumpLevel([])).toBeNull();
  });

  it('picks the highest level', () => {
    expect(bumpLevel(commits('fix: a'))).toBe('patch');
    expect(bumpLevel(commits('fix: a', 'feat: b'))).toBe('minor');
    expect(bumpLevel(commits('feat: b', 'fix: a'))).toBe('minor');
    expect(bumpLevel(commits('fix: a', 'feat: b', 'chore!: c'))).toBe('major');
  });
});

describe('withoutReverted', () => {
  const c = (sha: string, message: string) => ({sha, message});
  const shas = (list: {sha: string}[]) => list.map(x => x.sha);

  it('drops a commit and its revert, matched by sha', () => {
    const list = [
      c('c3', 'Revert "feat: a"\n\nThis reverts commit a1b2c3d4.'),
      c('c2', 'fix: b'),
      c('a1b2c3d4e5', 'feat: a'),
    ];

    expect(shas(withoutReverted(list))).toEqual(['c2']);
  });

  it('matches squashed reverts by subject', () => {
    const list = [c('c2', 'Revert "feat: a"'), c('c1', 'feat: a')];

    expect(withoutReverted(list)).toEqual([]);
  });

  it('restores a commit when its revert is reverted', () => {
    const list = [
      c('c3', 'Revert "Revert "feat: a""'),
      c('c2', 'Revert "feat: a"'),
      c('c1', 'feat: a'),
    ];

    expect(shas(withoutReverted(list))).toEqual(['c1']);
  });

  it('ignores reverts of commits outside the list', () => {
    const list = [c('c2', 'Revert "feat: old"'), c('c1', 'fix: x')];

    expect(shas(withoutReverted(list))).toEqual(['c1']);
  });
});
