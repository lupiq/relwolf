import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {RELWOLF_VERSION} from '../src/app-version.js';

describe('RELWOLF_VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      version: string;
    };

    expect(RELWOLF_VERSION).toBe(pkg.version);
  });
});
