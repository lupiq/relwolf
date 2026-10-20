import {describe, expect, it} from 'vitest';
import {
  findReleaseTags,
  highest,
  highestStable,
  isValidReleaseTag,
  tagName,
  tagPattern,
  tagPrefix,
} from '../src/tags.js';

describe('tags', () => {
  const all = [
    'v1.0.0',
    'v1.2.0',
    'v1.10.0-beta.1',
    'v1.9.0',
    'app-v3.0.0',
    'app-v3.1.0-rc.1',
    'v-nonsense',
    'latest',
    'web-app-v2.0.0',
  ];

  it('builds prefixes and names', () => {
    expect(tagPrefix()).toBe('v');
    expect(tagPrefix('app')).toBe('app-v');
    expect(tagName(undefined, '1.2.3')).toBe('v1.2.3');
    expect(tagName('app', '1.2.3')).toBe('app-v1.2.3');
  });

  it('only finds tags of the requested package', () => {
    expect(
      findReleaseTags(all)
        .map(t => t.tag)
        .sort(),
    ).toEqual(['v1.0.0', 'v1.10.0-beta.1', 'v1.2.0', 'v1.9.0']);
    expect(
      findReleaseTags(all, 'app')
        .map(t => t.tag)
        .sort(),
    ).toEqual(['app-v3.0.0', 'app-v3.1.0-rc.1']);
    expect(findReleaseTags(all, 'web-app').map(t => t.tag)).toEqual([
      'web-app-v2.0.0',
    ]);
  });

  it('picks the highest tags semantically, not lexically', () => {
    const tags = findReleaseTags(all);

    expect(highest(tags)?.tag).toBe('v1.10.0-beta.1');
    expect(highestStable(tags)?.tag).toBe('v1.9.0');
    expect(highest([])).toBeUndefined();
  });

  it('creates anchored regexes', () => {
    const stable = new RegExp(tagPattern('my.app', false));

    expect(stable.test('my.app-v1.0.0')).toBe(true);
    expect(stable.test('myxapp-v1.0.0')).toBe(false);
    expect(stable.test('my.app-v1.0.0-beta.1')).toBe(false);
    const any = new RegExp(tagPattern(undefined, true));

    expect(any.test('v1.0.0-beta.1')).toBe(true);
    expect(any.test('app-v1.0.0')).toBe(false);
  });

  it('validates tags from untrusted text', () => {
    expect(isValidReleaseTag('v1.2.3')).toBe(true);
    expect(isValidReleaseTag('app-v1.2.3-beta.1')).toBe(true);
    expect(isValidReleaseTag('web-app-v1.2.3')).toBe(true);

    for (const bad of [
      'main',
      'v1',
      'v1.2.3 ',
      '../v1.2.3',
      'v1.2.3\nfoo',
      '-v1.2.3',
      'refs/tags/v1.2.3',
    ]) {
      expect(isValidReleaseTag(bad)).toBe(false);
    }
  });
});
