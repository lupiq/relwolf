import {describe, expect, it} from 'vitest';
import {
  bumpVersion,
  compareVersions,
  formatVersion,
  nextVersion,
  parseVersion,
  type Version,
} from '../src/version.js';

const v = (input: string): Version => {
  const parsed = parseVersion(input);
  if (!parsed) throw new Error(`invalid ${input}`);
  return parsed;
};

describe('parseVersion / formatVersion', () => {
  it('round-trips valid versions', () => {
    for (const input of [
      '1.2.3',
      '0.0.1',
      '1.0.0-beta.1',
      '1.0.0-rc.1.2',
      '10.20.30',
    ]) {
      expect(formatVersion(v(input))).toBe(input);
    }
  });

  it('drops build metadata', () => {
    expect(formatVersion(v('1.2.3+build.5'))).toBe('1.2.3');
  });

  it.each(['1.2', '01.2.3', '1.2.3-', 'a.b.c', '1.2.3.4', 'v1.2.3'])(
    'rejects %s',
    input => {
      expect(parseVersion(input)).toBeNull();
    },
  );
});

describe('compareVersions', () => {
  it('follows the semver precedence examples', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareVersions(v(ordered[i]!), v(ordered[i + 1]!))).toBe(-1);
      expect(compareVersions(v(ordered[i + 1]!), v(ordered[i]!))).toBe(1);
    }
    expect(compareVersions(v('1.0.0'), v('1.0.0'))).toBe(0);
  });
});

describe('bumpVersion', () => {
  it('bumps each level', () => {
    expect(formatVersion(bumpVersion(v('1.2.3'), 'major', true))).toBe('2.0.0');
    expect(formatVersion(bumpVersion(v('1.2.3'), 'minor', true))).toBe('1.3.0');
    expect(formatVersion(bumpVersion(v('1.2.3'), 'patch', true))).toBe('1.2.4');
  });

  it('turns breaking changes into minor bumps before 1.0.0 when enabled', () => {
    expect(formatVersion(bumpVersion(v('0.4.1'), 'major', true))).toBe('0.5.0');
    expect(formatVersion(bumpVersion(v('0.4.1'), 'major', false))).toBe(
      '1.0.0',
    );
  });
});

describe('nextVersion', () => {
  const base = {minorPreMajor: true};

  it('returns null without releasable changes', () => {
    expect(
      nextVersion({...base, level: null, lastStable: v('1.0.0')}),
    ).toBeNull();
  });

  it('bumps from the last stable version', () => {
    expect(
      formatVersion(
        nextVersion({...base, level: 'minor', lastStable: v('1.4.2')})!,
      ),
    ).toBe('1.5.0');
  });

  it('starts from 0.0.0 when there is no tag', () => {
    expect(formatVersion(nextVersion({...base, level: 'minor'})!)).toBe(
      '0.1.0',
    );
    expect(formatVersion(nextVersion({...base, level: 'patch'})!)).toBe(
      '0.0.1',
    );
    expect(formatVersion(nextVersion({...base, level: 'major'})!)).toBe(
      '0.1.0',
    );
  });

  it('uses the configured initial version verbatim', () => {
    expect(
      formatVersion(
        nextVersion({...base, level: 'patch', initialVersion: v('1.0.0')})!,
      ),
    ).toBe('1.0.0');
  });

  it('starts a pre-release series', () => {
    const result = nextVersion({
      ...base,
      level: 'minor',
      lastStable: v('1.0.0'),
      lastAny: v('1.0.0'),
      prerelease: 'beta',
    });
    expect(formatVersion(result!)).toBe('1.1.0-beta.1');
  });

  it('increments the pre-release counter for the same base', () => {
    const result = nextVersion({
      ...base,
      level: 'minor',
      lastStable: v('1.0.0'),
      lastAny: v('1.1.0-beta.1'),
      prerelease: 'beta',
    });
    expect(formatVersion(result!)).toBe('1.1.0-beta.2');
  });

  it('restarts the counter when the base version grows', () => {
    const result = nextVersion({
      ...base,
      level: 'major',
      lastStable: v('1.0.0'),
      lastAny: v('1.1.0-beta.3'),
      prerelease: 'beta',
    });
    expect(formatVersion(result!)).toBe('2.0.0-beta.1');
  });

  it('restarts the counter for a different identifier', () => {
    const result = nextVersion({
      ...base,
      level: 'minor',
      lastStable: v('1.0.0'),
      lastAny: v('1.1.0-beta.4'),
      prerelease: 'rc',
    });
    expect(formatVersion(result!)).toBe('1.1.0-rc.1');
  });

  it('graduates to the stable version when no pre-release is configured', () => {
    const result = nextVersion({
      ...base,
      level: 'minor',
      lastStable: v('1.0.0'),
      lastAny: v('1.1.0-beta.2'),
    });
    expect(formatVersion(result!)).toBe('1.1.0');
  });

  it('handles pre-release tags without a counter', () => {
    const result = nextVersion({
      ...base,
      level: 'patch',
      lastStable: v('1.0.0'),
      lastAny: v('1.0.1-beta'),
      prerelease: 'beta',
    });
    expect(formatVersion(result!)).toBe('1.0.1-beta.1');
  });
});
