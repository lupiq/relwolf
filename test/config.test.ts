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
        tagPrefix: 'v',
        tagSuffix: '',
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

describe('new properties', () => {
  it('has defaults that keep the previous behaviour', () => {
    const config = parseConfig(undefined);

    expect(config).toMatchObject({
      branchPrefix: 'relwolf/',
      releaseName: '${tag}',
      labels: {pending: 'relwolf: pending', tagged: 'relwolf: tagged'},
      draft: false,
      patchTypes: ['fix'],
      minorTypes: ['feat'],
      excludePaths: [],
      separatePullRequests: false,
      linkedGroups: [],
    });
  });

  it('rejects invalid values', () => {
    const bad = [
      'patch-types: [feat]',
      'minor-types: [fix]\npatch-types: [FIX]',
      'tag-template: "v${component}"\npackages:\n  a: {component: a}\n  b: {component: b}\n  c: {}',
      'tag-template: "v"',
      'tag-template: "${version}${version}"',
      'tag-template: "v ${version}"',
      'pull-request-body: "no notes"',
      'pull-request-body: "${notes} ${notes}"',
      'release-name: "${foo}"',
      'bootstrap-sha: nothex',
      'exclude-paths: ["../x"]',
      'labels: {pending: same, tagged: same}',
      'branch-prefix: "../x/"',
      'linked-versions: [[a, b]]',
      'linked-versions: [[a]]',
      'linked-tags: single',
      'linked-tags: nope',
      'tag-template: "${version}"\npackages:\n  a: {}\n  b: {component: b}',
    ];

    for (const yaml of bad) {
      expect(() => parseConfig(yaml), yaml).toThrow();
    }
  });

  it('resolves the tag template per package', () => {
    const config = parseConfig(
      'tag-template: "${component}@${version}"\npackages:\n  a: {component: x}\n  b: {component: y}',
    );

    expect(config.packages.map(p => [p.tagPrefix, p.tagSuffix])).toEqual([
      ['x@', ''],
      ['y@', ''],
    ]);
  });

  it('resolves linked versions', () => {
    const config = parseConfig(
      'linked-versions: true\npackages:\n  a: {component: a}\n  b: {component: b}',
    );

    expect(config.linkedGroups).toEqual([['a', 'b']]);
  });

  it('allows a shared tag format for packages of a single-tag group', () => {
    const config = parseConfig(
      'linked-versions: true\nlinked-tags: single\ntag-template: "v${version}"\npackages:\n  a: {}\n  b: {component: b}',
    );

    expect(config.linkedTags).toBe('single');
  });

  it('rejects further invalid combinations', () => {
    const bad = [
      'packages:\n  a: {component: a}\n  ./a: {component: b}',
      'linked-versions: [[a, b], [b, c]]\npackages:\n  a: {component: a}\n  b: {component: b}\n  c: {component: c}',
      'separate-pull-requests: true\npackages:\n  ".": {}\n  x: {component: root}',
    ];

    for (const yaml of bad) {
      expect(() => parseConfig(yaml), yaml).toThrow(ConfigError);
    }
  });

  it('enables release emojis only with a body that has the release block', () => {
    expect(parseConfig(undefined).releaseEmoji).toBe(false);
    expect(parseConfig('release-emoji: true').releaseEmoji).toBe(true);
    expect(() =>
      parseConfig('release-emoji: true\npull-request-body: "${notes}"'),
    ).toThrow(/release-emoji requires/);
    expect(
      parseConfig(
        'release-emoji: true\npull-request-body: "${release}${notes}"',
      ).releaseEmoji,
    ).toBe(true);
  });
});
