import {describe, expect, it} from 'vitest';
import {parseConfig} from '../src/config.js';
import {parseReleaseAs, ReleaseAsError} from '../src/release-as.js';
import {formatVersion} from '../src/version.js';

const single = parseConfig(undefined).packages;
const mono = parseConfig(
  'packages:\n  a:\n    component: a\n  b:\n    component: b\n',
).packages;

describe('parseReleaseAs', () => {
  it('returns nothing for empty input', () => {
    expect(parseReleaseAs(undefined, single).size).toBe(0);
    expect(parseReleaseAs('  ', single).size).toBe(0);
  });

  it('parses bare versions and the v prefix', () => {
    const result = parseReleaseAs('v1.0.0', single);

    expect(formatVersion(result.get('')!)).toBe('1.0.0');
  });

  it('parses components and auto', () => {
    const result = parseReleaseAs('a=2.0.0, b=auto', mono);

    expect(formatVersion(result.get('a')!)).toBe('2.0.0');
    expect(result.get('b')).toBeNull();
  });

  it('rejects bare versions when all packages have a component', () => {
    expect(() => parseReleaseAs('1.0.0', mono)).toThrow(ReleaseAsError);
  });

  it('rejects unknown components and invalid versions', () => {
    expect(() => parseReleaseAs('c=1.0.0', mono)).toThrow(/unknown/);
    expect(() => parseReleaseAs('a=x', mono)).toThrow(/valid/);
  });
});
