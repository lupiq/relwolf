import {describe, expect, it} from 'vitest';
import type {PackageConfig} from '../src/config.js';
import {
  findReleaseTags,
  highest,
  highestStable,
  isValidReleaseTag,
  parseReleaseTag,
  tagName,
  tagPattern,
} from '../src/tags.js';

const format = (tagPrefix: string, tagSuffix = '') => ({tagPrefix, tagSuffix});
const pkg = (path: string, tagPrefix: string, tagSuffix = '') =>
  ({
    path,
    changelogPath: 'CHANGELOG.md',
    updaters: [],
    minorPreMajor: true,
    tagPrefix,
    tagSuffix,
  }) as PackageConfig;

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
    expect(tagName(format('v'), '1.2.3')).toBe('v1.2.3');
    expect(tagName(format('app-v'), '1.2.3')).toBe('app-v1.2.3');
    expect(tagName(format('app/', '-final'), '1.2.3')).toBe('app/1.2.3-final');
  });

  it('only finds tags of the requested package', () => {
    expect(
      findReleaseTags(all, format('v'))
        .map(t => t.tag)
        .sort(),
    ).toEqual(['v1.0.0', 'v1.10.0-beta.1', 'v1.2.0', 'v1.9.0']);
    expect(
      findReleaseTags(all, format('app-v'))
        .map(t => t.tag)
        .sort(),
    ).toEqual(['app-v3.0.0', 'app-v3.1.0-rc.1']);
    expect(findReleaseTags(all, format('web-app-v')).map(t => t.tag)).toEqual([
      'web-app-v2.0.0',
    ]);
  });

  it('picks the highest tags semantically, not lexically', () => {
    const tags = findReleaseTags(all, format('v'));

    expect(highest(tags)?.tag).toBe('v1.10.0-beta.1');
    expect(highestStable(tags)?.tag).toBe('v1.9.0');
    expect(highest([])).toBeUndefined();
  });

  it('creates anchored regexes', () => {
    const stable = new RegExp(tagPattern(format('my.app-v'), false));

    expect(stable.test('my.app-v1.0.0')).toBe(true);
    expect(stable.test('myxapp-v1.0.0')).toBe(false);
    expect(stable.test('my.app-v1.0.0-beta.1')).toBe(false);
    const any = new RegExp(tagPattern(format('v'), true));

    expect(any.test('v1.0.0-beta.1')).toBe(true);
    expect(any.test('app-v1.0.0')).toBe(false);
  });

  it('supports a suffix in the tag format', () => {
    const regex = new RegExp(tagPattern(format('', '-app'), false));

    expect(regex.test('1.0.0-app')).toBe(true);
    expect(regex.test('1.0.0-beta.1-app')).toBe(false);
    expect(
      findReleaseTags(['1.0.0-app', '2.0.0'], format('', '-app')).map(
        t => t.tag,
      ),
    ).toEqual(['1.0.0-app']);
  });

  it('validates tags from untrusted text', () => {
    const packages = [
      pkg('.', 'v'),
      pkg('app', 'app-v'),
      pkg('web', 'web-app-v'),
    ];

    expect(isValidReleaseTag('v1.2.3', packages)).toBe(true);
    expect(isValidReleaseTag('app-v1.2.3-beta.1', packages)).toBe(true);
    expect(isValidReleaseTag('web-app-v1.2.3', packages)).toBe(true);
    expect(isValidReleaseTag('other-v1.2.3', packages)).toBe(false);

    for (const bad of [
      'main',
      'v1',
      'v1.2.3 ',
      '../v1.2.3',
      'v1.2.3\nfoo',
      '-v1.2.3',
      'refs/tags/v1.2.3',
    ]) {
      expect(isValidReleaseTag(bad, packages)).toBe(false);
    }
  });

  it('assigns a tag to the package with the most specific prefix', () => {
    const packages = [pkg('.', ''), pkg('app', 'app-')];

    expect(parseReleaseTag('app-1.0.0', packages)?.pkg.path).toBe('app');
    expect(parseReleaseTag('1.0.0', packages)?.pkg.path).toBe('.');
    expect(parseReleaseTag('x-1.0.0', packages)).toBeNull();
  });
});
