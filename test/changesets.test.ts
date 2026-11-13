import {chmodSync, rmSync} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {parseBody} from '../src/body.js';
import {extractNotes, loadWorkspace} from '../src/changesets.js';
import {parseConfig} from '../src/config.js';
import {run} from '../src/release.js';
import {FakeProvider, mergeLastRelease, TestRepo} from './helpers.js';

let repo: TestRepo;
let provider: FakeProvider;
let logs: Array<string>;

beforeEach(() => {
  repo = new TestRepo();
  provider = new FakeProvider();
  logs = [];
});

afterEach(() => repo.cleanup());

const exec = (yaml = '', overrides: {releaseAs?: string} = {}) =>
  run({
    cwd: repo.dir,
    config: parseConfig(`strategy: changesets\n${yaml}`),
    provider,
    currentBranch: 'main',
    releaseAs: overrides.releaseAs,
    env: {...process.env, NO_COLOR: '1'},
    log: message => logs.push(message),
  });

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const CONFIG = {
  $schema: 'https://unpkg.com/@changesets/config/schema.json',
  changelog: '@changesets/cli/changelog',
  commit: false,
  fixed: [],
  linked: [],
  access: 'restricted',
  baseBranch: 'main',
  updateInternalDependencies: 'patch',
  ignore: [],
};

function changeset(id: string, releases: Record<string, string>, text: string) {
  const header = Object.entries(releases)
    .map(([name, type]) => `"${name}": ${type}`)
    .join('\n');

  repo.write(`.changeset/${id}.md`, `---\n${header}\n---\n\n${text}\n`);
}

function singlePackage(config: Record<string, unknown> = {}): void {
  repo.write('package.json', json({name: 'demo', version: '1.0.0'}));
  repo.write('.changeset/config.json', json({...CONFIG, ...config}));
  repo.commit('chore: setup');
}

function monorepo(config: Record<string, unknown> = {}): void {
  repo.write('package.json', json({name: 'root', private: true}));
  repo.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  repo.write(
    'packages/a/package.json',
    json({name: '@scope/a', version: '1.0.0'}),
  );
  repo.write(
    'packages/b/package.json',
    json({name: 'b', version: '2.0.0', dependencies: {'@scope/a': '1.0.0'}}),
  );
  repo.write(
    'packages/internal/package.json',
    json({name: 'internal', version: '0.1.0', private: true}),
  );
  repo.write('.changeset/config.json', json({...CONFIG, ...config}));
  repo.commit('chore: setup');
}

const fileOf = (name: string) => {
  const file = provider.commits.at(-1)?.files.find(f => f.path === name);

  if (!file) {
    throw new Error(`${name} is not part of the release commit`);
  }

  return file;
};

describe('extractNotes', () => {
  it('returns the section of a version without its heading', () => {
    const changelog =
      '# demo\n\n## 1.1.0\n\n### Minor Changes\n\n- abc: Feature\n\n## 1.0.0\n\n- Old\n';

    expect(extractNotes(changelog, '1.1.0')).toBe(
      '### Minor Changes\n\n- abc: Feature',
    );
    expect(extractNotes(changelog, '1.0.0')).toBe('- Old');
    expect(extractNotes(changelog, '2.0.0')).toBe('');
  });
});

describe('loadWorkspace', () => {
  it('derives packages and tags from the workspace', async () => {
    monorepo();
    const workspace = await loadWorkspace(repo.dir);

    expect(workspace.packageConfigs).toEqual([
      expect.objectContaining({
        path: 'packages/a',
        component: '@scope/a',
        changelogPath: 'packages/a/CHANGELOG.md',
        tagPrefix: '@scope/a@',
      }),
      expect.objectContaining({path: 'packages/b', tagPrefix: 'b@'}),
      expect.objectContaining({path: 'packages/internal'}),
    ]);
    expect([...workspace.tagged]).toEqual(['@scope/a', 'b']);
  });

  it('uses v-tags for a single package and needs .changeset/config.json', async () => {
    singlePackage({privatePackages: {version: true, tag: true}});
    expect((await loadWorkspace(repo.dir)).packageConfigs).toEqual([
      expect.objectContaining({path: '.', component: 'demo', tagPrefix: 'v'}),
    ]);

    rmSync(path.join(repo.dir, '.changeset'), {recursive: true});
    await expect(loadWorkspace(repo.dir)).rejects.toThrow(
      /\.changeset\/config\.json is missing/,
    );
  });
});

describe('strategy changesets', () => {
  it('opens a release request with what changesets wrote, then tags the merge', async () => {
    monorepo();
    changeset('brave-cats', {'@scope/a': 'minor'}, 'Add a feature');
    repo.commit('feat: a', 'packages/a/index.js');

    const first = await exec();

    expect(first.releaseRequests).toEqual([
      expect.objectContaining({action: 'created'}),
    ]);
    expect(provider.requests[0]!.title).toContain('@scope/a@1.1.0');
    expect(provider.requests[0]!.title).toContain('b@2.0.1');
    expect(JSON.parse(fileOf('packages/a/package.json').content)).toEqual({
      name: '@scope/a',
      version: '1.1.0',
    });
    expect(JSON.parse(fileOf('packages/b/package.json').content)).toEqual({
      name: 'b',
      version: '2.0.1',
      dependencies: {'@scope/a': '1.1.0'},
    });
    expect(fileOf('packages/a/CHANGELOG.md').content).toMatch(
      /^# @scope\/a\n\n## 1\.1\.0\n\n### Minor Changes\n\n- [0-9a-f]{7}: Add a feature\n/,
    );
    expect(fileOf('.changeset/brave-cats.md')).toEqual(
      expect.objectContaining({deleted: true}),
    );

    const entries = parseBody(provider.requests[0]!.body, () => true);

    expect(entries.map(entry => entry.tag)).toEqual([
      '@scope/a@1.1.0',
      'b@2.0.1',
    ]);
    expect(entries[0]!.notes).toMatch(
      /^### Minor Changes\n\n- .*Add a feature$/,
    );
    expect(entries[1]!.notes).toContain('Updated dependencies');
    expect(repo.git('status', '--porcelain')).toBe('');

    mergeLastRelease(repo, provider, 1);
    const second = await exec();

    expect(second.tagged).toEqual(['@scope/a@1.1.0', 'b@2.0.1']);
    expect(provider.releases.map(release => release.name)).toEqual([
      '@scope/a@1.1.0',
      'b@2.0.1',
    ]);
    expect(second.releaseRequests).toEqual([]);
    expect(logs).toContain('No pending changesets in .changeset.');
  });

  it('updates markers, runs the pre-commit-script on the applied files and tags v-versions', async () => {
    singlePackage();
    repo.write('README.md', 'npm i demo@1.0.0 # x-relwolf-version:demo\n');
    repo.write(
      'scripts/seen.sh',
      '#!/bin/sh\ngrep -o \'"version": "[^"]*"\' package.json > seen.txt\n',
    );
    chmodSync(path.join(repo.dir, 'scripts/seen.sh'), 0o755);
    changeset('quick-fox', {demo: 'patch'}, 'Fix a bug');
    repo.commit('fix: a');

    await exec(
      'pre-commit-script: scripts/seen.sh\nupdaters:\n  - type: generic\n    path: README.md\n',
    );

    expect(provider.requests[0]!.title).toContain('v1.0.1');
    expect(fileOf('README.md').content).toBe(
      'npm i demo@1.0.1 # x-relwolf-version:demo\n',
    );
    expect(fileOf('seen.txt').content).toBe('"version": "1.0.1"\n');
    expect(repo.git('status', '--porcelain')).toBe('');

    mergeLastRelease(repo, provider, 1);
    expect((await exec()).tagged).toEqual(['v1.0.1']);
  });

  it('releases pre-releases in pre mode', async () => {
    singlePackage();
    repo.write(
      '.changeset/pre.json',
      json({
        mode: 'pre',
        tag: 'beta',
        initialVersions: {demo: '1.0.0'},
        changesets: [],
      }),
    );
    changeset('new-api', {demo: 'minor'}, 'New API');
    repo.commit('feat: a');

    await exec();

    const [entry] = parseBody(provider.requests[0]!.body, () => true);

    expect(entry).toEqual(
      expect.objectContaining({tag: 'v1.1.0-beta.0', prerelease: true}),
    );
    expect(logs.join('\n')).toMatch(/pre-release mode "beta"/);
    // The old pre.json format is migrated by changesets on the way.
    expect(JSON.parse(fileOf('.changeset/pre.json').content)).toEqual({
      mode: 'pre',
      tag: 'beta',
    });
    expect(fileOf('.changeset/new-api.md').deleted).toBe(true);
    expect(fileOf('.changeset/pre/new-api.md').content).toContain('New API');
    expect(repo.git('status', '--porcelain')).toBe('');

    mergeLastRelease(repo, provider, 1);
    const second = await exec();

    expect(second.tagged).toEqual(['v1.1.0-beta.0']);
    expect(provider.releases[0]!.prerelease).toBe(true);
    expect(second.releaseRequests).toEqual([]);
  });

  it('opens no release request if only untagged private packages change and closes an obsolete one', async () => {
    monorepo({privatePackages: {version: true, tag: false}});
    changeset('one', {'@scope/a': 'patch'}, 'Fix');
    repo.commit('fix: a');
    await exec();
    expect(provider.requests[0]!.state).toBe('open');

    rmSync(path.join(repo.dir, '.changeset/one.md'));
    changeset('two', {internal: 'minor'}, 'Internal');
    repo.commit('chore: switch');

    expect((await exec()).releaseRequests).toEqual([]);
    expect(provider.requests[0]!.state).toBe('closed');
    expect(logs.join('\n')).toMatch(/Only private packages without tags/);
  });

  it('rejects RELWOLF_RELEASE_AS and unknown changelog generators', async () => {
    singlePackage({changelog: 'changelog-that-does-not-exist'});
    changeset('x', {demo: 'patch'}, 'Fix');
    repo.commit('fix: a');

    await expect(exec('', {releaseAs: '2.0.0'})).rejects.toThrow(
      /RELWOLF_RELEASE_AS is not supported/,
    );
    await expect(exec()).rejects.toThrow(
      /Changesets could not apply the release/,
    );
    expect(repo.git('status', '--porcelain')).toBe('');
  });
});
