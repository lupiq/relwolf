import {execFileSync} from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {parseBody as parse} from '../src/body.js';
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

const parseBody = (body: string) => parse(body, () => true);

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

    expect(result.releaseRequests[0]).toBeUndefined();
    expect(provider.requests).toHaveLength(0);
    expect(provider.commits).toHaveLength(0);
  });

  it('uses the configured title template', async () => {
    repo.commit('feat: a');
    await exec('pull-request-title: "Release ${version}"\n');
    expect(provider.requests[0]!.title).toBe('Release 0.1.0');
  });

  it('closes the open request when its only commit is reverted', async () => {
    const sha = repo.commit('feat: a');

    await exec();
    expect(provider.requests[0]!.state).toBe('open');

    repo.commit(`Revert "feat: a"\n\nThis reverts commit ${sha}.`);
    const result = await exec();

    expect(result.releaseRequests[0]).toBeUndefined();
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
      'chore(release): Create release v0.0.1',
    );
  });

  it('opens a release request with changelog and updated files', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: initial feature');
    repo.commit('fix(core): repair thing');
    repo.commit('chore: noise');

    const result = await exec(NODE_CONFIG);

    expect(result.releaseRequests[0]).toMatchObject({id: 1, action: 'created'});
    const [request] = provider.requests;

    expect(request).toMatchObject({
      title: 'chore(release): Create release v0.1.0',
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

  it('updates an existing package-lock.json, unless lockfiles are disabled', async () => {
    const lock = (version: string) =>
      `{\n  "name": "demo",\n  "version": "${version}",\n  "packages": {\n    "": {\n      "version": "${version}"\n    }\n  }\n}\n`;

    repo.write('package.json', PACKAGE_JSON);
    repo.write('package-lock.json', lock('0.0.0'));
    repo.commit('feat: a');
    await exec(NODE_CONFIG);
    const files = Object.fromEntries(
      provider.commits[0]!.files.map(f => [f.path, f.content]),
    );

    expect(Object.keys(files).sort()).toEqual([
      'CHANGELOG.md',
      'package-lock.json',
      'package.json',
    ]);
    expect(files['package-lock.json']).toBe(lock('0.1.0'));
  });

  it('leaves lockfiles alone with lockfiles: false', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.write('package-lock.json', '{"version":"0.0.0"}\n');
    repo.commit('feat: a');
    await exec(
      'packages:\n  ".":\n    updaters:\n      - type: package-json\n        lockfiles: false\n',
    );
    expect(provider.commits[0]!.files.map(f => f.path).sort()).toEqual([
      'CHANGELOG.md',
      'package.json',
    ]);
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
      'chore(release): Create release v0.0.1',
    );

    const again = await exec(NODE_CONFIG);

    expect(again.releaseRequests[0]).toMatchObject({
      id: 1,
      action: 'unchanged',
    });
    expect(provider.commits).toHaveLength(1);

    repo.commit('feat: second');
    const updated = await exec(NODE_CONFIG);

    expect(updated.releaseRequests[0]).toMatchObject({
      id: 1,
      action: 'updated',
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.title).toBe(
      'chore(release): Create release v0.1.0',
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
    expect(result.releaseRequests[0]).toBeUndefined();
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

    expect(result.releaseRequests[0]).toMatchObject({action: 'created'});
    // 0.x: breaking change becomes a minor bump by default
    expect(provider.requests[1]!.title).toBe(
      'chore(release): Create release v0.2.0',
    );
    const files = Object.fromEntries(
      provider.commits.at(-1)!.files.map(f => [f.path, f]),
    );
    const changelog = files['CHANGELOG.md']!;

    expect(changelog.exists).toBe(true);
    expect(changelog.content).toMatch(/0\.2\.0[\s\S]*0\.1\.0/);
    expect(changelog.content).toMatch(/later bug/i);
    expect(changelog.content).not.toMatch(/Create release/);
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
      'chore(release): Create release v0.1.0-beta.1',
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
    expect((await exec(config)).releaseRequests[0]).toBeUndefined();

    repo.commit('fix: two');
    await exec(config);
    expect(provider.requests[1]!.title).toBe(
      'chore(release): Create release v0.1.0-beta.2',
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
      'chore(release): Create release v0.1.0',
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
      'chore(release): Create release v0.1.0, api-v0.1.0',
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

    expect(first.releaseRequests[0]?.action).toBe('created');
    expect(provider.requests[0]!.title).toBe(
      'chore(release): Create release api-v0.0.1',
    );
    mergeLastRelease(repo, provider, 1);

    const tagged = await exec(config);

    expect(tagged.tagged).toEqual(['api-v0.0.1']);
    expect(provider.releases[0]!.tag).toBe('api-v0.0.1');

    repo.commit('feat: root only', 'root.txt');
    await exec(config);
    expect(provider.requests[1]!.title).toBe(
      'chore(release): Create release v0.1.0',
    );
  });
});

describe('RELWOLF_RELEASE_AS', () => {
  const title = () => provider.requests.at(-1)!.title;

  it('forces the version and keeps it until the request is merged', async () => {
    repo.commit('feat: a');
    await exec(undefined, {releaseAs: '1.0.0'});
    expect(title()).toBe('chore(release): Create release v1.0.0');
    expect(provider.requests[0]!.body).toMatch(/RELWOLF_RELEASE_AS/);

    repo.commit('fix: b');
    await exec();
    expect(title()).toBe('chore(release): Create release v1.0.0');

    mergeLastRelease(repo, provider, 1);
    expect((await exec()).tagged).toEqual(['v1.0.0']);
  });

  it('can be reset with auto', async () => {
    repo.commit('feat: a');
    await exec(undefined, {releaseAs: 'v1.0.0'});
    await exec(undefined, {releaseAs: 'auto'});
    expect(title()).toBe('chore(release): Create release v0.1.0');
  });

  it('closes the open request when auto leaves nothing to release', async () => {
    repo.commit('chore: a');
    await exec(undefined, {releaseAs: '1.0.0'});
    expect(provider.requests[0]!.state).toBe('open');

    const result = await exec(undefined, {releaseAs: 'auto'});

    expect(result.releaseRequests[0]).toBeUndefined();
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

    expect(result.releaseRequests[0]).toBeUndefined();
  });

  it('applies to a single component in a monorepo', async () => {
    repo.write('services/api/code.txt', 'x');
    repo.write('root.txt', 'x');
    repo.commit('feat: init', 'services/api/code.txt');
    const config =
      'packages:\n  services/api:\n    component: api\n    updaters: []\n';

    await exec(config, {releaseAs: 'api=2.0.0'});
    expect(title()).toBe('chore(release): Create release api-v2.0.0');
  });
});

describe('commit type rules', () => {
  it('releases the configured patch and minor types', async () => {
    repo.commit('feat: ignored now');

    const result = await exec(
      'patch-types: [fix, perf]\nminor-types: [improvement]',
    );

    expect(result.releaseRequests[0]).toBeUndefined();

    repo.commit('perf: faster again');

    await exec('patch-types: [fix, perf]\nminor-types: [improvement]');
    expect(provider.requests[0]!.title).toMatch(/v0\.0\.1/);
  });

  it('releases breaking changes of any type', async () => {
    repo.commit('chore!: drop node 18');
    await exec();
    expect(provider.requests[0]!.title).toMatch(/v0\.1\.0/);
  });

  it('ignores changes in excluded paths and before the bootstrap sha', async () => {
    const first = repo.commit('feat: old');

    repo.commit('feat: docs only', 'docs/page.md');
    expect(
      (await exec('exclude-paths: ["docs/**"]\nbootstrap-sha: ' + first))
        .releaseRequests,
    ).toEqual([]);

    repo.commit('fix: real', 'src/code.txt');
    await exec('exclude-paths: ["docs/**"]\nbootstrap-sha: ' + first);
    expect(provider.requests[0]!.title).toMatch(/v0\.0\.1/);
    expect(parseBody(provider.requests[0]!.body)[0]!.notes).not.toMatch(
      /old|docs only/,
    );
  });
});

describe('release request settings', () => {
  it('applies labels, branch prefix, draft, people, name and templates', async () => {
    repo.commit('feat: a');
    const yaml = `
branch-prefix: bot/
labels:
  pending: waiting
  tagged: done
draft: true
assignees: [alice]
reviewers: [bob]
release-name: "Release \${version}"
release-commit-message: "chore: release \${tags}\\n\\nAutomated."
pull-request-body: "Custom \${version}\\n\\n\${notes}\\n\\nFooter"
`;

    await exec(yaml);
    const request = provider.requests[0]!;

    expect(request.sourceBranch).toBe('bot/main');
    expect(request.labels).toEqual(['waiting']);
    expect(request.draft).toBe(true);
    expect(request.assignees).toEqual(['alice']);
    expect(request.reviewers).toEqual(['bob']);
    expect(request.body).toMatch(/^Custom 0\.1\.0\n\n<!-- relwolf:notes/);
    expect(request.body).toMatch(/Footer/);
    expect(provider.commits[0]!.message).toBe(
      'chore: release v0.1.0\n\nAutomated.',
    );

    mergeLastRelease(repo, provider, 1);
    await exec(yaml);
    expect(provider.releases[0]!.name).toBe('Release 0.1.0');
    expect(request.labels).toEqual(['done']);
  });
});

describe('tag template', () => {
  it('uses the template for tags, discovery and releases', async () => {
    repo.write('services/api/code.txt', 'x');
    repo.commit('feat: init', 'services/api/code.txt');
    const yaml =
      'tag-template: "${component}/${version}"\npackages:\n  services/api:\n    component: api\n    updaters: []\n';

    await exec(yaml);
    mergeLastRelease(repo, provider, 1);
    await exec(yaml);
    expect([...provider.tags.keys()]).toEqual(['api/0.1.0']);

    repo.commit('fix: later', 'services/api/code.txt');
    await exec(yaml);
    expect(provider.requests[1]!.title).toMatch(/api\/0\.1\.1/);
  });
});

describe('globs in updater paths', () => {
  it('updates every matching file and fails without a match', async () => {
    repo.write('a/pkg.json', '{"version": "0.0.0"}\n');
    repo.write('b/pkg.json', '{"version": "0.0.0"}\n');
    repo.commit('feat: a');

    await exec(
      'packages:\n  ".":\n    updaters:\n      - type: package-json\n        path: "*/pkg.json"\n',
    );
    expect(provider.commits[0]!.files.map(f => f.path).sort()).toEqual([
      'CHANGELOG.md',
      'a/pkg.json',
      'b/pkg.json',
    ]);

    await expect(
      exec(
        'packages:\n  ".":\n    updaters:\n      - type: package-json\n        path: "none/*.json"\n',
      ),
    ).rejects.toThrow(/matches no file/);
  });
});

describe('linked versions and separate requests', () => {
  const packages = `
packages:
  services/api:
    component: api
    updaters: []
  services/web:
    component: web
    updaters: []
`;

  function setup() {
    repo.write('services/api/a.txt', 'x');
    repo.write('services/web/w.txt', 'x');
    repo.commit('chore: scaffold');
  }

  it('gives linked packages one shared version, even if only one changed', async () => {
    setup();
    repo.commit('feat: api only', 'services/api/a.txt');
    await exec(`linked-versions: true${packages}`);

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.title).toMatch(/api-v0\.1\.0/);
    expect(provider.requests[0]!.title).toMatch(/web-v0\.1\.0/);

    mergeLastRelease(repo, provider, 1);
    await exec(`linked-versions: true${packages}`);
    repo.commit('fix: web only', 'services/web/w.txt');
    await exec(`linked-versions: true${packages}`);

    expect(provider.requests[1]!.title).toMatch(/api-v0\.1\.1/);
    expect(provider.requests[1]!.title).toMatch(/web-v0\.1\.1/);
  });

  it('links only the listed groups', async () => {
    setup();
    repo.commit('feat: api', 'services/api/a.txt');
    await exec(`linked-versions:\n  - [services/api, services/web]${packages}`);
    expect(provider.requests[0]!.title).toMatch(/web-v0\.1\.0/);
  });

  it('opens one request per package', async () => {
    setup();
    repo.commit('feat: api', 'services/api/a.txt');
    repo.commit('fix: web', 'services/web/w.txt');
    const result = await exec(`separate-pull-requests: true${packages}`);

    expect(result.releaseRequests).toHaveLength(2);
    expect(provider.requests.map(r => r.sourceBranch)).toEqual([
      'relwolf/main/api',
      'relwolf/main/web',
    ]);
    expect(provider.requests[0]!.title).toMatch(/api-v0\.1\.0/);
    expect(provider.requests[1]!.title).toMatch(/web-v0\.0\.1/);

    const again = await exec(`separate-pull-requests: true${packages}`);

    expect(again.releaseRequests.map(r => r.action)).toEqual([
      'unchanged',
      'unchanged',
    ]);
  });
});

describe('multi-module Gradle project with a shared version', () => {
  const yaml = `
linked-versions: true
packages:
  ".":
    updaters: []
  services/orders:
    component: orders
    updaters: []
  common/core:
    component: core
    updaters: []
`;

  it('releases every module with one version and its own changelog', async () => {
    repo.write('services/orders/a.txt', 'x');
    repo.write('common/core/c.txt', 'x');
    repo.commit('chore: scaffold');
    repo.commit('feat: new order flow', 'services/orders/a.txt');
    await exec(yaml);

    const files = provider.commits[0]!.files.map(f => f.path).sort();

    expect(files).toEqual([
      'CHANGELOG.md',
      'common/core/CHANGELOG.md',
      'services/orders/CHANGELOG.md',
    ]);
    expect(provider.requests[0]!.title).toMatch(/core-v0\.1\.0/);

    mergeLastRelease(repo, provider, 1);
    await exec(yaml);
    expect([...provider.tags.keys()].sort()).toEqual([
      'core-v0.1.0',
      'orders-v0.1.0',
      'v0.1.0',
    ]);
  });
});

describe('linked packages with a single tag', () => {
  const yaml = `
linked-versions: true
linked-tags: single
packages:
  ".":
    updaters: []
  services/orders:
    component: orders
    updaters: []
  common/core:
    component: core
    updaters: []
`;

  it('creates one tag and release but a changelog per module', async () => {
    repo.write('services/orders/a.txt', 'x');
    repo.write('common/core/c.txt', 'x');
    repo.commit('chore: scaffold');
    repo.commit('feat: new order flow', 'services/orders/a.txt');
    repo.commit('fix: core bug', 'common/core/c.txt');
    await exec(yaml);

    expect(provider.commits[0]!.files.map(f => f.path).sort()).toEqual([
      'CHANGELOG.md',
      'common/core/CHANGELOG.md',
      'services/orders/CHANGELOG.md',
    ]);
    expect(provider.requests[0]!.title).toBe(
      'chore(release): Create release v0.1.0',
    );

    const [entry, ...rest] = parseBody(provider.requests[0]!.body);

    expect(rest).toEqual([]);
    expect(entry!.notes).toMatch(/## orders[\s\S]*new order flow/i);
    expect(entry!.notes).toMatch(/## core[\s\S]*core bug/i);

    mergeLastRelease(repo, provider, 1);
    await exec(yaml);
    expect([...provider.tags.keys()]).toEqual(['v0.1.0']);
    expect(provider.releases).toHaveLength(1);

    repo.commit('fix: later', 'common/core/c.txt');
    await exec(yaml);
    expect(provider.requests[1]!.title).toMatch(/v0\.1\.1/);
  });

  async function releaseThenChangeOrders(config: string) {
    repo.write('services/orders/a.txt', 'x');
    repo.write('common/core/c.txt', 'x');
    repo.commit('chore: scaffold');
    repo.commit('feat: orders first', 'services/orders/a.txt');
    await exec(config);
    mergeLastRelease(repo, provider, 1);
    await exec(config);
    repo.commit('fix: orders only', 'services/orders/a.txt');
    await exec(config);

    return provider.commits.at(-1)!.files;
  }

  it('marks modules without changes in the changelog and release notes', async () => {
    const files = await releaseThenChangeOrders(yaml);
    const core = files.find(f => f.path === 'common/core/CHANGELOG.md')!;
    const orders = files.find(f => f.path === 'services/orders/CHANGELOG.md')!;

    expect(core.content).toMatch(
      /0\.1\.1[\s\S]*No changes, version bumped to stay in sync\./,
    );
    expect(orders.content).not.toMatch(/No changes/);
    expect(parseBody(provider.requests[1]!.body)[0]!.notes).toMatch(
      /## core\n\nNo changes, version bumped/,
    );
  });

  it('can customise the text', async () => {
    const files = await releaseThenChangeOrders(
      `no-changes-text: "Nothing here."${yaml}`,
    );

    expect(
      files.find(f => f.path === 'common/core/CHANGELOG.md')!.content,
    ).toMatch(/Nothing here\./);
  });
});

describe('release request details', () => {
  it('restores a missing pending label and keeps the draft state', async () => {
    repo.commit('fix: a');
    await exec('draft: true');
    provider.requests[0]!.labels = [];
    repo.commit('feat: b');
    await exec('draft: true');

    expect(provider.requests[0]!.labels).toEqual(['relwolf: pending']);
    expect(provider.requests[0]!.draft).toBe(true);
  });

  it('opens one request for a linked group in separate mode', async () => {
    repo.write('a/x.txt', 'x');
    repo.write('b/x.txt', 'x');
    repo.write('c/x.txt', 'x');
    repo.commit('chore: scaffold');
    repo.commit('feat: a', 'a/x.txt');
    repo.commit('fix: c', 'c/x.txt');
    await exec(`
separate-pull-requests: true
linked-versions:
  - [a, b]
packages:
  a: {component: a}
  b: {component: b}
  c: {component: c}
`);

    expect(provider.requests.map(r => r.sourceBranch)).toEqual([
      'relwolf/main/a+b',
      'relwolf/main/c',
    ]);
    expect(provider.requests[0]!.title).toMatch(/a-v0\.1\.0.*b-v0\.1\.0/);
  });
});

describe('release title and text', () => {
  const edit = (title: string, text: string) => {
    const request = provider.requests[0]!;

    request.body = request.body
      .replace(
        /(<!-- relwolf:title -->\n)[\s\S]*?(\n<!-- \/relwolf:title -->)/,
        (_, a: string, b: string) => `${a}${title}${b}`,
      )
      .replace(
        /(<!-- relwolf:text -->\n)[\s\S]*?(\n<!-- \/relwolf:text -->)/,
        (_, a: string, b: string) => `${a}${text}${b}`,
      );
  };

  it('puts the default title and an empty text into the request', async () => {
    repo.commit('feat: a');
    await exec();

    const {body} = provider.requests[0]!;

    expect(body).toMatch(/<!-- relwolf:title -->\n\$\{tag\}\n/);
    expect(body).toMatch(/<!-- relwolf:text -->\n<!--[^\n]*-->\n/);

    mergeLastRelease(repo, provider, 1);
    await exec();
    expect(provider.releases[0]!.name).toBe('v0.1.0');
    expect(provider.releases[0]!.body).not.toMatch(/Optional Markdown/);
  });

  it('uses the edited title and text and keeps them on updates', async () => {
    repo.commit('feat: a');
    await exec();
    edit('Big ${version} 🎉', 'Some **intro**');
    repo.commit('fix: b');
    await exec();

    const {body} = provider.requests[0]!;

    expect(body).toMatch(/Big \$\{version\} 🎉/);
    expect(body).toMatch(/Some \*\*intro\*\*/);
    expect(body).toMatch(/- fix: b|B/);

    mergeLastRelease(repo, provider, 1);
    await exec();
    expect(provider.releases[0]!.name).toBe('Big 0.1.0 🎉');
    expect(provider.releases[0]!.body).toMatch(/^Some \*\*intro\*\*\n\n/);
  });

  it('adds a random emoji once and keeps it stable', async () => {
    const yaml = 'release-emoji: true\nrelease-name: "Release ${tag}"';

    repo.commit('feat: a');
    await run({
      cwd: repo.dir,
      config: parseConfig(yaml),
      provider,
      currentBranch: 'main',
      random: () => 0,
    });
    expect(provider.requests[0]!.body).toMatch(/\n🚀 Release \$\{tag\}\n/);

    repo.commit('fix: b');
    await run({
      cwd: repo.dir,
      config: parseConfig(yaml),
      provider,
      currentBranch: 'main',
      random: () => 0.5,
    });
    expect(provider.requests[0]!.body).toMatch(/\n🚀 Release \$\{tag\}\n/);

    mergeLastRelease(repo, provider, 1);
    await exec(yaml);
    expect(provider.releases[0]!.name).toBe('🚀 Release v0.1.0');
  });
});

describe('explanations in the log', () => {
  const logs = async (yaml?: string) => {
    const lines: Array<string> = [];

    await run({
      cwd: repo.dir,
      config: parseConfig(yaml),
      provider,
      currentBranch: 'main',
      log: message => lines.push(message),
    });

    return lines.join('\n');
  };

  it('explains the bump for a first release', async () => {
    repo.commit('feat: a');
    repo.commit('fix: b');
    repo.commit('chore: c');
    repo.commit('not conventional');

    const output = await logs();

    expect(output).toMatch(/Release branch "main" on fake; 1 package: root/);
    expect(output).toMatch(/No previous release tag found/);
    expect(output).toMatch(
      /Analysed 4 commits: 1 chore, 1 feat, 1 fix; 1 not following/,
    );
    expect(output).toMatch(
      /Found 1 feat commit, bumping minor: no release -> v0\.1\.0/,
    );
    expect(output).toMatch(/Done: nothing tagged; #1 created\./);
  });

  it('explains breaking changes, pre-major handling and nothing to release', async () => {
    repo.commit('feat: a');
    await logs();
    mergeLastRelease(repo, provider, 1);
    await logs();
    repo.commit('feat!: b');

    const breaking = await logs();

    expect(breaking).toMatch(/Last stable release: v0\.1\.0/);
    expect(breaking).toMatch(
      /Found 1 breaking change, bumping major \(breaking changes only bump minor before 1\.0\.0.*\): v0\.1\.0 -> v0\.2\.0/,
    );
  });

  it('lists the releasable types when there is nothing to release', async () => {
    repo.commit('feat: a');
    await logs();
    mergeLastRelease(repo, provider, 1);
    await logs();
    repo.commit('chore: x');

    expect(await logs()).toMatch(
      /No releasable commits since v0\.1\.0\. Releasable types: feat \(minor\), fix \(patch\)/,
    );
  });

  it('prefixes the lines with the package in a monorepo', async () => {
    repo.write('services/api/x.txt', 'x');
    repo.commit('feat: a', 'services/api/x.txt');

    const output = await logs(
      'packages:\n  services/api:\n    component: api\n    updaters: []\n  services/web:\n    component: web\n    updaters: []\n',
    );

    expect(output).toMatch(/\[api\] Found 1 feat commit, bumping minor/);
    expect(output).toMatch(/\[web\] No (releasable commits|commits touch)/);
  });
});

describe('pre-commit-script', () => {
  const SCRIPT = 'scripts/format.sh';
  const CONFIG = `pre-commit-script: ${SCRIPT}\n`;
  const NODE = `${CONFIG}${NODE_CONFIG}`;

  const addScript = (body: string): void => {
    repo.write(SCRIPT, `#!/bin/sh\n${body}\n`);
    chmodSync(path.join(repo.dir, SCRIPT), 0o755);
    repo.git('add', '-A');
    repo.git('commit', '-q', '-m', 'chore: add script');
  };

  const committed = (file: string): string =>
    provider.commits.at(-1)!.files.find(candidate => candidate.path === file)!
      .content;

  it('commits what the script changes and leaves the working tree clean', async () => {
    repo.write('package.json', PACKAGE_JSON);
    repo.commit('feat: a');
    addScript(
      'echo "formatted" >> CHANGELOG.md\necho "extra" > generated.txt\n',
    );

    await exec(NODE);

    expect(committed('CHANGELOG.md')).toMatch(/formatted\n$/);
    expect(committed('package.json')).toMatch(/"version": "0\.1\.0"/);
    expect(
      provider.commits.at(-1)!.files.find(f => f.path === 'generated.txt'),
    ).toMatchObject({content: 'extra\n', exists: false});
    expect(repo.git('status', '--porcelain')).toBe('');
    expect(existsSync(path.join(repo.dir, 'generated.txt'))).toBe(false);
  });

  it('fails with a hint when the script is missing or fails', async () => {
    repo.commit('feat: a');
    await expect(exec(CONFIG)).rejects.toThrow(/does not exist/);

    addScript('echo boom >&2\nexit 1');
    await expect(exec(CONFIG)).rejects.toThrow(/failed.*boom/s);
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('rejects files deleted by the script', async () => {
    repo.write('old.txt', 'x');
    repo.commit('feat: a', 'old.txt');
    addScript('rm old.txt');

    await expect(exec(CONFIG)).rejects.toThrow(/deleted or renamed "old.txt"/);
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('refuses to overwrite uncommitted changes in release files', async () => {
    repo.commit('feat: a');
    addScript('true');
    repo.write('CHANGELOG.md', 'local edit\n');

    await expect(exec(CONFIG)).rejects.toThrow(/uncommitted changes/);
  });
});
