import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ConfigError, loadConfig, parseConfig} from '../src/config.js';
import {formatVersion} from '../src/version.js';

describe('parseConfig', () => {
  it('defaults to a single root package', () => {
    const config = parseConfig(undefined);
    expect(config.packages).toEqual([
      {
        path: '.',
        changelogPath: 'CHANGELOG.md',
        updaters: [],
        minorPreMajor: true,
      },
    ]);
    expect(config.branch).toBeUndefined();
  });

  it('parses a full single-package config', () => {
    const config = parseConfig(`
branch: develop
cliff-config: ./config/cliff.toml
prerelease: beta
bump-minor-pre-major: false
packages:
  ".":
    initial-version: 1.0.0
    updaters:
      - type: package-json
      - type: pom-xml
      - type: gradle
        path: gradle.properties
      - type: generic
        path: docs/version.txt
`);
    expect(config.branch).toBe('develop');
    expect(config.cliffConfig).toBe('config/cliff.toml');
    const [pkg] = config.packages;
    expect(pkg).toMatchObject({
      path: '.',
      prerelease: 'beta',
      minorPreMajor: false,
      changelogPath: 'CHANGELOG.md',
    });
    expect(formatVersion(pkg!.initialVersion!)).toBe('1.0.0');
    expect(pkg!.updaters).toEqual([
      {type: 'package-json', path: 'package.json'},
      {type: 'pom-xml', path: 'pom.xml'},
      {type: 'gradle', path: 'gradle.properties'},
      {type: 'generic', path: 'docs/version.txt'},
    ]);
  });

  it('resolves monorepo paths relative to each package', () => {
    const config = parseConfig(`
prerelease: rc
packages:
  ".":
    updaters: [{ type: package-json }]
  services/api:
    component: api
    prerelease: beta
    bump-minor-pre-major: false
    changelog-path: docs/CHANGES.md
    updaters:
      - type: pom-xml
      - type: generic
        path: version.txt
`);
    expect(config.packages).toHaveLength(2);
    const [root, api] = config.packages;
    expect(root).toMatchObject({path: '.', prerelease: 'rc'});
    expect(api).toMatchObject({
      path: 'services/api',
      component: 'api',
      prerelease: 'beta',
      minorPreMajor: false,
      changelogPath: 'services/api/docs/CHANGES.md',
    });
    expect(api!.updaters).toEqual([
      {type: 'pom-xml', path: 'services/api/pom.xml'},
      {type: 'generic', path: 'services/api/version.txt'},
    ]);
  });

  it('normalizes package paths', () => {
    expect(
      parseConfig('packages:\n  ./a/b/:\n    component: ab').packages[0]!.path,
    ).toBe('a/b');
  });

  it.each([
    ['unknown keys', 'unknown: 1', /unknown/i],
    ['unknown package keys', 'packages:\n  ".":\n    foo: 1', /foo/],
    [
      'unknown updater type',
      'packages:\n  ".":\n    updaters: [{ type: nope }]',
      /updaters/,
    ],
    [
      'generic without path',
      'packages:\n  ".":\n    updaters: [{ type: generic }]',
      /requires a "path"/,
    ],
    ['invalid prerelease', "prerelease: 'be ta'", /prerelease/],
    ['invalid yaml', 'a: [', /Invalid YAML/],
    [
      'path traversal in updater',
      'packages:\n  ".":\n    updaters: [{ type: generic, path: ../x }]',
      /inside the repository/,
    ],
    [
      'absolute updater path',
      'packages:\n  ".":\n    updaters: [{ type: generic, path: /etc/passwd }]',
      /inside the repository/,
    ],
    [
      'path traversal in package',
      'packages:\n  ../x:\n    component: x',
      /inside the repository/,
    ],
    [
      'traversal in cliff-config',
      'cliff-config: ../cliff.toml',
      /inside the repository/,
    ],
    [
      'prerelease initial version',
      'packages:\n  ".":\n    initial-version: 1.0.0-beta.1',
      /initial-version/,
    ],
    [
      'garbage initial version',
      'packages:\n  ".":\n    initial-version: abc',
      /initial-version/,
    ],
    [
      'two packages without component',
      'packages:\n  a: {}\n  b: {}',
      /At most one package/,
    ],
    [
      'duplicate component',
      'packages:\n  a: { component: x }\n  b: { component: x }',
      /Duplicate component/,
    ],
    ['invalid component', "packages:\n  a: { component: 'a b' }", /component/],
    ['no packages', 'packages: {}', /at least one package/],
    [
      'unknown title placeholder',
      'pull-request-title: "Release ${versoin}"',
      /only \$\{tags\}/,
    ],
  ])('rejects %s', (_name, yaml, message) => {
    expect(() => parseConfig(yaml)).toThrow(ConfigError);
    expect(() => parseConfig(yaml)).toThrow(message);
  });

  it('parses a custom pull request title', () => {
    expect(
      parseConfig('pull-request-title: "Release ${version}"').pullRequestTitle,
    ).toBe('Release ${version}');
  });

  it('treats an empty file as defaults', () => {
    expect(parseConfig('# only a comment\n').packages).toHaveLength(1);
  });
});

describe('loadConfig', () => {
  it('reads relwolf.yaml from the directory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'relwolf-cfg-'));
    try {
      expect(await loadConfig(dir)).toMatchObject({found: false});
      writeFileSync(path.join(dir, 'relwolf.yaml'), 'branch: trunk\n');
      const {config, found} = await loadConfig(dir);
      expect(found).toBe(true);
      expect(config.branch).toBe('trunk');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
