import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parse} from 'yaml';
import {configSchema} from '../src/config.js';

const SKILL_DIR = 'skills/relwolf-setup';

const markdownFiles = (dir: string): Array<string> =>
  readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory()
      ? markdownFiles(path.join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [path.join(dir, entry.name)]
        : [],
  );

const MARKER = /(?:^|\s)x-relwolf-(?:version|minor|major)(?::\S+)?\s*$/m;

const read = (file: string): string => readFileSync(file, 'utf8');

describe('relwolf-setup skill', () => {
  it('has frontmatter with the folder name and a description', () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(read(`${SKILL_DIR}/SKILL.md`));
    const frontmatter = parse(match?.[1] ?? '') as {
      name?: string;
      description?: string;
    };

    expect(frontmatter.name).toBe('relwolf-setup');
    expect(frontmatter.description?.length).toBeGreaterThan(0);
  });

  it('only links to files that exist', () => {
    for (const file of markdownFiles(SKILL_DIR)) {
      const links = [...read(file).matchAll(/\]\((?!https?:|#)([^)#]+)/g)];

      for (const [, target] of links) {
        expect(
          existsSync(path.join(path.dirname(file), target ?? '')),
          `${file} links to ${target}`,
        ).toBe(true);
      }
    }
  });

  it('registers every file with an x-relwolf marker in relwolf.yaml', () => {
    const config = parse(read('relwolf.yaml')) as {
      packages: Record<string, {updaters: Array<{path?: string}>}>;
    };
    const registered = new Set(
      config.packages['.']?.updaters.map(updater => updater.path),
    );

    for (const file of markdownFiles(SKILL_DIR)) {
      if (MARKER.test(read(file))) {
        expect(registered.has(file), `${file} is not an updater`).toBe(true);
      }
    }
  });

  it('mentions every top-level option of the config schema', () => {
    const options = read(`${SKILL_DIR}/references/options.md`);
    const notAsked = ['http-timeout', 'pre-commit-script-tokens'];
    const missing = Object.keys(configSchema.shape).filter(
      key => !notAsked.includes(key) && !options.includes(key),
    );

    expect(missing).toEqual([]);
  });
});
