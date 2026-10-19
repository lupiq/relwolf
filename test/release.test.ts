import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {parseBody} from '../src/body.js';
import {parseConfig} from '../src/config.js';
import {run, RunError} from '../src/release.js';
import {FakeProvider, mergeLastRelease, TestRepo} from './helpers.js';

let repo: TestRepo;
let provider: FakeProvider;

beforeEach(() => {
  repo = new TestRepo();
  provider = new FakeProvider();
});

afterEach(() => repo.cleanup());

const exec = (
  yaml?: string,
  overrides: {currentBranch?: string; releaseAs?: string} = {},
) =>
  run({
    cwd: repo.dir,
    config: parseConfig(yaml),
    provider,
    currentBranch: overrides.currentBranch ?? 'main',
    releaseAs: overrides.releaseAs,
    env: {...process.env, NO_COLOR: '1'},
  });

const PACKAGE_JSON = '{\n  "name": "demo",\n  "version": "0.0.0"\n}\n';
const NODE_CONFIG =
  'packages:\n  ".":\n    updaters:\n      - type: package-json\n';

describe('guards', () => {
  it('skips pipelines that are not for the release branch', async () => {
    repo.commit('feat: a');
    const result = await exec(undefined, {currentBranch: 'feature/x'});
    expect(result.skipped).toMatch(/feature\/x/);
    expect(provider.requests).toHaveLength(0);

    expect((await exec(undefined, {currentBranch: ''})).skipped).toMatch(
      /not a branch pipeline/,
    );
  });

  it('honours the configured branch', async () => {
    repo.commit('feat: a');
    expect((await exec('branch: trunk')).skipped).toMatch(/"trunk"/);
  });

  it('refuses shallow clones with a hint', async () => {
    repo.commit('feat: a');
    repo.commit('fix: b');
    const clone = mkdtempSync(path.join(tmpdir(), 'relwolf-shallow-'));
    try {
      execFileSync('git', [
        'clone',
        '-q',
        '--depth',
        '1',
        `file://${repo.dir}`,
        clone,
      ]);
      await expect(
        run({
          cwd: clone,
          config: parseConfig(undefined),
          provider,
          currentBranch: 'main',
        }),
      ).rejects.toThrow(/GIT_DEPTH/);
      await expect(
        run({
          cwd: clone,
          config: parseConfig(undefined),
          provider,
          currentBranch: 'main',
        }),
      ).rejects.toBeInstanceOf(RunError);
    } finally {
      rmSync(clone, {recursive: true, force: true});
    }
  });
});

describe('release request', () => {
  it('does nothing without releasable commits', async () => {
    repo.commit('chore: setup');
    repo.commit('docs: readme');
    const result = await exec();
    expect(result.releaseRequest).toBeUndefined();
    expect(provider.requests).toHaveLength(0);
    expect(provider.commits).toHaveLength(0);
  });

  it('closes the open request when its only commit is reverted', async () => {
    const sha = repo.commit('feat: a');
    await exec();
    expect(provider.requests[0]!.state).toBe('open');

    repo.commit(`Revert "feat: a"\n\nThis reverts commit ${sha}.`);
    const result = await exec();
    expect(result.releaseRequest).toBeUndefined();
    expect(provider.requests[0]!.state).toBe('closed');
  });

  it('leaves reverted commits and their reverts out of the changelog', async () => {
    const sha = repo.commit('feat: reverted feature');
    repo.commit('fix: kept fix');
    repo.commit(
      `Revert "feat: reverted feature"\n\nThis reverts commit ${sha}.`,
    );
    await exec();
    const body = provider.requests[0]!.body;
    expect(body).toContain('Kept fix');
    expect(body).not.toContain('reverted feature');
    expect(body).not.toContain('Revert');
  });

  it('ignores reverted commits when computing the version', async () => {
    repo.commit('feat: a');
    repo.commit('fix: b');
    repo.commit('Revert "feat: a"');
    await exec();
    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for v0.0.1',
    );
  });

  it('opens a release request with changelog and updated files', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: initial feature');
    repo.commit('fix(core): repair thing');
    repo.commit('chore: noise');

    const result = await exec(NODE_CONFIG);

    expect(result.releaseRequest).toMatchObject({id: 1, action: 'created'});
    const [request] = provider.requests;
    expect(request).toMatchObject({
      title: 'chore(release): prepare for v0.1.0',
      sourceBranch: 'relwolf/main',
      targetBranch: 'main',
      labels: ['relwolf: pending'],
    });
    expect(provider.labels).toContain('relwolf: pending');

    const [commit] = provider.commits;
    expect(commit).toMatchObject({
      branch: 'relwolf/main',
      baseSha: repo.head(),
      message: request!.title,
    });
    const byPath = Object.fromEntries(commit!.files.map(f => [f.path, f]));
    expect(Object.keys(byPath).sort()).toEqual([
      'CHANGELOG.md',
      'package.json',
    ]);
    expect(byPath['CHANGELOG.md']).toMatchObject({exists: false});
    expect(byPath['CHANGELOG.md']!.content).toMatch(/0\.1\.0/);
    expect(byPath['CHANGELOG.md']!.content).toMatch(/initial feature/i);
    expect(byPath['CHANGELOG.md']!.content).toMatch(/repair thing/i);
    expect(byPath['package.json']).toMatchObject({exists: true});
    expect(JSON.parse(byPath['package.json']!.content).version).toBe('0.1.0');

    const entries = parseBody(request!.body);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({tag: 'v0.1.0', prerelease: false});
    expect(entries[0]!.notes).toMatch(/initial feature/i);
  });

  it('does not touch the working tree', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: a');
    repo.git('add', '-A');
    await exec(NODE_CONFIG);
    expect(repo.git('status', '--porcelain')).toBe('');
    expect(existsSync(path.join(repo.dir, 'CHANGELOG.md'))).toBe(false);
    expect(readFileSync(path.join(repo.dir, 'package.json'), 'utf8')).toBe(
      PACKAGE_JSON,
    );
  });

  it('is idempotent and updates the request when new commits arrive', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('fix: first');
    await exec(NODE_CONFIG);
    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for v0.0.1',
    );

    const again = await exec(NODE_CONFIG);
    expect(again.releaseRequest).toMatchObject({id: 1, action: 'unchanged'});
    expect(provider.commits).toHaveLength(1);

    repo.commit('feat: second');
    const updated = await exec(NODE_CONFIG);
    expect(updated.releaseRequest).toMatchObject({id: 1, action: 'updated'});
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for v0.1.0',
    );
    expect(provider.commits).toHaveLength(2);
    expect(provider.commits[1]!.baseSha).toBe(repo.head());
  });

  it('uses the configured initial version', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: a');
    await exec(
      'packages:\n  ".":\n    initial-version: 1.0.0\n    updaters: [{ type: package-json }]',
    );
    expect(provider.requests[0]!.title).toContain('v1.0.0');
  });

  it('fails clearly when a configured file is missing', async () => {
    repo.commit('feat: a');
    await expect(exec(NODE_CONFIG)).rejects.toThrow(
      /package\.json" configured in relwolf\.yaml does not exist/,
    );
    expect(provider.commits).toHaveLength(0);
  });

  it("uses the user's cliff config", async () => {
    repo.write(
      'cliff.toml',
      '[changelog]\nbody = "RELWOLF-CUSTOM {{ version }}"\n\n[git]\nconventional_commits = true\n',
    );
    repo.commit('feat: a');
    await exec('cliff-config: cliff.toml');
    expect(provider.commits[0]!.files[0]!.content).toContain(
      'RELWOLF-CUSTOM v0.1.0',
    );
  });
});

describe('tagging merged release requests', () => {
  async function firstRelease() {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: initial');
    await exec(NODE_CONFIG);
    return mergeLastRelease(repo, provider, 1);
  }

  it('tags the merge commit, publishes the release and relabels the request', async () => {
    const mergeSha = await firstRelease();

    const result = await exec(NODE_CONFIG);

    expect(result.tagged).toEqual(['v0.1.0']);
    expect(provider.tags.get('v0.1.0')).toBe(mergeSha);
    expect(repo.git('rev-parse', 'v0.1.0')).toBe(mergeSha);
    expect(provider.releases).toHaveLength(1);
    expect(provider.releases[0]).toMatchObject({
      tag: 'v0.1.0',
      name: 'v0.1.0',
      prerelease: false,
    });
    expect(provider.releases[0]!.body).toMatch(/initial/i);
    expect(provider.releases[0]!.body).not.toMatch(/^# Changelog/);
    expect(provider.requests[0]!.labels).toEqual(['relwolf: tagged']);
    expect(provider.labels).toContain('relwolf: tagged');
    // the release commit itself is not releasable, so no new request is opened
    expect(result.releaseRequest).toBeUndefined();
    expect(provider.requests).toHaveLength(1);
  });

  it('is idempotent', async () => {
    await firstRelease();
    await exec(NODE_CONFIG);
    const second = await exec(NODE_CONFIG);
    expect(second.tagged).toEqual([]);
    expect(provider.releases).toHaveLength(1);
  });

  it('recovers when the tag already exists but the release does not', async () => {
    const sha = await firstRelease();
    provider.tags.set('v0.1.0', sha);
    const result = await exec(NODE_CONFIG);
    expect(result.tagged).toEqual(['v0.1.0']);
    expect(provider.releases).toHaveLength(1);
    expect(provider.requests[0]!.labels).toEqual(['relwolf: tagged']);
  });

  it('does not create a release twice', async () => {
    await firstRelease();
    provider.releases.push({
      tag: 'v0.1.0',
      name: 'v0.1.0',
      body: 'manual',
      prerelease: false,
    });
    await exec(NODE_CONFIG);
    expect(provider.releases).toHaveLength(1);
    expect(provider.releases[0]!.body).toBe('manual');
  });

  it('continues with the next release cycle and prepends to the changelog', async () => {
    await firstRelease();
    await exec(NODE_CONFIG);

    repo.commit('fix: later bug');
    repo.commit('feat!: breaking thing');
    const result = await exec(NODE_CONFIG);

    expect(result.releaseRequest).toMatchObject({action: 'created'});
    // 0.x: breaking change becomes a minor bump by default
    expect(provider.requests[1]!.title).toBe(
      'chore(release): prepare for v0.2.0',
    );
    const files = Object.fromEntries(
      provider.commits.at(-1)!.files.map(f => [f.path, f]),
    );
    const changelog = files['CHANGELOG.md']!;
    expect(changelog.exists).toBe(true);
    expect(changelog.content).toMatch(/0\.2\.0[\s\S]*0\.1\.0/);
    expect(changelog.content).toMatch(/later bug/i);
    expect(changelog.content).not.toMatch(/prepare for/);
    expect(JSON.parse(files['package.json']!.content).version).toBe('0.2.0');
    // the notes of the new release must not repeat the old release
    expect(parseBody(provider.requests[1]!.body)[0]!.notes).not.toMatch(
      /initial/i,
    );
  });

  it('defers requests whose merge commit is not part of the checkout', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: initial');
    await exec(NODE_CONFIG);
    provider.mustFind(1).state = 'merged';
    provider.mustFind(1).mergeSha = '0'.repeat(40);

    const result = await exec(NODE_CONFIG);
    expect(result.tagged).toEqual([]);
    expect(provider.tags.size).toBe(0);
    expect(provider.requests[0]!.labels).toEqual(['relwolf: pending']);
  });

  it('fails loudly on merged requests without release information', async () => {
    repo.commit('feat: initial');
    await exec();
    const request = provider.mustFind(1);
    request.state = 'merged';
    request.mergeSha = repo.head();
    request.body = 'edited away';
    await expect(exec()).rejects.toThrow(/no release information/);

    request.body = provider.requests[0]!.body.replace(
      /<!-- relwolf:notes[\s\S]*<!-- \/relwolf:notes -->/,
      'edited away',
    );
    delete request.mergeSha;
    request.body =
      '<!-- relwolf:notes tag="v0.1.0" prerelease="false" -->\nx\n<!-- /relwolf:notes -->';
    await expect(exec()).rejects.toThrow(/merge commit/);
  });
});

describe('pre-releases', () => {
  const config =
    'prerelease: beta\npackages:\n  ".":\n    updaters: [{ type: package-json }]\n';

  it('publishes pre-releases, increments them and graduates to stable', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: one');
    await exec(config);
    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for v0.1.0-beta.1',
    );
    expect(parseBody(provider.requests[0]!.body)[0]).toMatchObject({
      prerelease: true,
    });
    mergeLastRelease(repo, provider, 1);
    await exec(config);
    expect(provider.releases[0]).toMatchObject({
      tag: 'v0.1.0-beta.1',
      prerelease: true,
    });

    // nothing releasable since the last pre-release: no new request
    expect((await exec(config)).releaseRequest).toBeUndefined();

    repo.commit('fix: two');
    await exec(config);
    expect(provider.requests[1]!.title).toBe(
      'chore(release): prepare for v0.1.0-beta.2',
    );
    const notes = parseBody(provider.requests[1]!.body)[0]!.notes;
    expect(notes).toMatch(/two/i);
    expect(notes).not.toMatch(/one/i);
    mergeLastRelease(repo, provider, 2);
    await exec(config);

    // dropping the prerelease option graduates to the stable version, even without new commits
    const stable =
      'packages:\n  ".":\n    updaters: [{ type: package-json }]\n';
    await exec(stable);
    expect(provider.requests[2]!.title).toBe(
      'chore(release): prepare for v0.1.0',
    );
    const files = Object.fromEntries(
      provider.commits.at(-1)!.files.map(f => [f.path, f]),
    );
    expect(JSON.parse(files['package.json']!.content).version).toBe('0.1.0');
    const graduationNotes = parseBody(provider.requests[2]!.body)[0]!.notes;
    expect(graduationNotes).toMatch(/one/i);
    expect(graduationNotes).toMatch(/two/i);
  });
});

describe('monorepo', () => {
  const config = `
packages:
  ".":
    updaters: [{ type: package-json }]
  services/api:
    component: api
    updaters:
      - type: generic
        path: VERSION
`;

  function setup() {
    repo.write('package.json', PACKAGE_JSON);
    repo.write('services/api/VERSION', '0.0.0 # x-relwolf-version\n');
    repo.commit('chore: scaffold');
  }

  it('versions packages independently based on touched paths', async () => {
    setup();
    repo.commit('feat: root feature', 'root.txt');
    repo.commit('fix: api fix', 'services/api/code.txt');
    repo.commit('feat: api feature', 'services/api/other.txt');

    await exec(config);

    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for v0.1.0, api-v0.1.0',
    );
    const files = Object.fromEntries(
      provider.commits[0]!.files.map(f => [f.path, f]),
    );
    expect(Object.keys(files).sort()).toEqual([
      'CHANGELOG.md',
      'package.json',
      'services/api/CHANGELOG.md',
      'services/api/VERSION',
    ]);
    expect(files['services/api/VERSION']!.content).toBe(
      '0.1.0 # x-relwolf-version\n',
    );
    expect(files['CHANGELOG.md']!.content).toMatch(/root feature/i);
    expect(files['CHANGELOG.md']!.content).not.toMatch(/api f/i);
    expect(files['services/api/CHANGELOG.md']!.content).toMatch(/api feature/i);
    expect(files['services/api/CHANGELOG.md']!.content).toMatch(/api fix/i);
    expect(files['services/api/CHANGELOG.md']!.content).not.toMatch(
      /root feature/i,
    );
  });

  it('only releases packages with changes and tags each separately', async () => {
    setup();
    repo.commit('fix: api fix', 'services/api/code.txt');
    const first = await exec(config);
    expect(first.releaseRequest?.action).toBe('created');
    expect(provider.requests[0]!.title).toBe(
      'chore(release): prepare for api-v0.0.1',
    );
    mergeLastRelease(repo, provider, 1);

    const tagged = await exec(config);
    expect(tagged.tagged).toEqual(['api-v0.0.1']);
    expect(provider.releases[0]!.tag).toBe('api-v0.0.1');

    repo.commit('feat: root only', 'root.txt');
    await exec(config);
    expect(provider.requests[1]!.title).toBe(
      'chore(release): prepare for v0.1.0',
    );
  });
});

describe('RELWOLF_RELEASE_AS', () => {
  const title = () => provider.requests.at(-1)!.title;

  it('forces the version and keeps it until the request is merged', async () => {
    repo.commit('feat: a');
    await exec(undefined, {releaseAs: '1.0.0'});
    expect(title()).toBe('chore(release): prepare for v1.0.0');
    expect(provider.requests[0]!.body).toMatch(/RELWOLF_RELEASE_AS/);

    repo.commit('fix: b');
    await exec();
    expect(title()).toBe('chore(release): prepare for v1.0.0');

    mergeLastRelease(repo, provider, 1);
    expect((await exec()).tagged).toEqual(['v1.0.0']);
  });

  it('can be reset with auto', async () => {
    repo.commit('feat: a');
    await exec(undefined, {releaseAs: 'v1.0.0'});
    await exec(undefined, {releaseAs: 'auto'});
    expect(title()).toBe('chore(release): prepare for v0.1.0');
  });

  it('closes the open request when auto leaves nothing to release', async () => {
    repo.commit('chore: a');
    await exec(undefined, {releaseAs: '1.0.0'});
    expect(provider.requests[0]!.state).toBe('open');

    const result = await exec(undefined, {releaseAs: 'auto'});
    expect(result.releaseRequest).toBeUndefined();
    expect(provider.requests[0]!.state).toBe('closed');
  });

  it('rejects versions that are not greater than the last tag', async () => {
    repo.commit('feat: a');
    await exec();
    mergeLastRelease(repo, provider, 1);
    await exec();
    repo.commit('fix: b');
    await expect(exec(undefined, {releaseAs: '0.1.0'})).rejects.toThrow(/auto/);
  });

  it('rejects invalid input and unknown components', async () => {
    repo.commit('feat: a');
    await expect(exec(undefined, {releaseAs: 'nope'})).rejects.toThrow(
      /semantic version/,
    );
    await expect(exec(undefined, {releaseAs: 'x=1.0.0'})).rejects.toThrow(
      /unknown component/,
    );
  });

  it('does nothing without new commits', async () => {
    repo.commit('feat: a');
    await exec();
    mergeLastRelease(repo, provider, 1);
    await exec();
    const result = await exec(undefined, {releaseAs: '1.0.0'});
    expect(result.releaseRequest).toBeUndefined();
  });

  it('applies to a single component in a monorepo', async () => {
    repo.write('services/api/code.txt', 'x');
    repo.write('root.txt', 'x');
    repo.commit('feat: init', 'services/api/code.txt');
    const config =
      'packages:\n  services/api:\n    component: api\n    updaters: []\n';
    await exec(config, {releaseAs: 'api=2.0.0'});
    expect(title()).toBe('chore(release): prepare for api-v2.0.0');
  });
});
