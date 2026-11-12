import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import type {Sandbox} from './sandbox.js';

/** The release flow scenarios, run once per provider against its sandbox. */
export function defineReleaseScenarios(name: string, sandbox: Sandbox): void {
  beforeAll(async () => {
    await sandbox.init();
  }, 120_000);

  afterEach(async () => {
    if (process.env.E2E_KEEP) {
      return;
    }

    await sandbox.cleanup();
  }, 120_000);

  afterAll(async () => {
    if (process.env.E2E_KEEP) {
      return;
    }

    await sandbox.cleanup();
  }, 120_000);

  async function newBranch(): Promise<string> {
    const branch = sandbox.newBranchName();

    await sandbox.createBranch(branch);

    return branch;
  }

  describe(`${name} release flow`, () => {
    it('creates and updates the release merge request', async () => {
      const branch = await newBranch();

      await sandbox.commit(branch, 'feat: Add search', {'src/search.txt': 'a'});

      const created = await sandbox.runRelwolf(branch);

      expect(created.releaseRequests[0]?.action).toBe('created');

      const mr = await sandbox.releaseRequest(created.releaseRequests[0]!.id);

      expect(mr).toMatchObject({
        title: 'chore(release): Create release v0.1.0',
        state: 'open',
        sourceBranch: `relwolf/${branch}`,
      });
      expect(mr.labels).toContain('relwolf: pending');
      expect(mr.body).toContain('Add search');
      expect(
        await sandbox.fileContent(`relwolf/${branch}`, 'CHANGELOG.md'),
      ).toContain('Add search');

      expect(
        (await sandbox.runRelwolf(branch)).releaseRequests[0]?.action,
      ).toBe('unchanged');

      await sandbox.commit(branch, 'fix: Handle empty input', {
        'src/search.txt': 'b',
      });
      const updated = await sandbox.runRelwolf(branch);

      expect(updated.releaseRequests[0]).toMatchObject({
        id: created.releaseRequests[0]!.id,
        action: 'updated',
      });
      const after = await sandbox.releaseRequest(
        created.releaseRequests[0]!.id,
      );

      expect(after.title).toBe('chore(release): Create release v0.1.0');
      expect(after.body).toContain('Handle empty input');
    });

    it('tags and releases once the merge request is merged', async () => {
      const branch = await newBranch();

      await sandbox.commit(branch, 'feat: Add search', {'src/search.txt': 'a'});
      const {releaseRequests} = await sandbox.runRelwolf(branch);

      await sandbox.merge(releaseRequests[0]!.id);

      const result = await sandbox.runRelwolf(branch);

      expect(result.tagged).toEqual(['v0.1.0']);
      expect(await sandbox.tagExists('v0.1.0')).toBe(true);
      expect(await sandbox.releaseBody('v0.1.0')).toContain('Add search');
      expect(
        (await sandbox.releaseRequest(releaseRequests[0]!.id)).labels,
      ).toContain('relwolf: tagged');

      const again = await sandbox.runRelwolf(branch);

      expect(again.tagged).toEqual([]);
      expect(again.releaseRequests[0]).toBeUndefined();
    });

    it('releases the packages of a monorepo independently', async () => {
      const branch = await newBranch();
      const config = `
packages:
  packages/api:
    component: api
    updaters:
      - type: package-json
  packages/web:
    component: web
    updaters:
      - type: package-json
`;

      await sandbox.commit(branch, 'chore: Add packages', {
        'packages/api/package.json': '{"name": "api", "version": "0.0.0"}\n',
        'packages/web/package.json': '{"name": "web", "version": "0.0.0"}\n',
      });
      await sandbox.commit(branch, 'feat(api): Add endpoint', {
        'packages/api/endpoint.txt': 'a',
      });
      await sandbox.commit(branch, 'fix(web): Fix layout', {
        'packages/web/layout.txt': 'a',
      });

      const {releaseRequests} = await sandbox.runRelwolf(branch, config);
      const mr = await sandbox.releaseRequest(releaseRequests[0]!.id);

      expect(mr.title).toBe(
        'chore(release): Create release api-v0.1.0, web-v0.0.1',
      );
      expect(mr.body).toContain('Add endpoint');
      expect(mr.body).toContain('Fix layout');
      expect(
        await sandbox.fileContent(
          `relwolf/${branch}`,
          'packages/api/package.json',
        ),
      ).toContain('"version": "0.1.0"');
      expect(
        await sandbox.fileContent(
          `relwolf/${branch}`,
          'packages/web/package.json',
        ),
      ).toContain('"version": "0.0.1"');

      await sandbox.merge(releaseRequests[0]!.id);
      const result = await sandbox.runRelwolf(branch, config);

      expect(result.tagged.sort()).toEqual(['api-v0.1.0', 'web-v0.0.1']);
      expect(await sandbox.releaseBody('api-v0.1.0')).toContain('Add endpoint');
      expect(await sandbox.releaseBody('web-v0.0.1')).toContain('Fix layout');
    });

    it('keeps releases without changes when rewriting the changelog', async () => {
      const branch = await newBranch();
      const cliffToml = (label: string): string =>
        `[changelog]\nheader = "# Log\\n"\nbody = "${label} {{ version }}{% for c in commits %}\\n- {{ c.message }}{% endfor %}\\n"\ntrim = true\n\n[git]\nconventional_commits = true\ncommit_parsers = [{message = '^chore', skip = true}]\n`;
      const config = `
linked-versions: true
linked-tags: single
rewrite-changelog: true
cliff-config: cliff.toml
no-changes-text: "Nothing here."
packages:
  '.':
    updaters: []
  packages/api:
    component: api
    updaters: []
  packages/web:
    component: web
    updaters: []
`;
      const release = async (): Promise<void> => {
        const {releaseRequests} = await sandbox.runRelwolf(branch, config);

        await sandbox.merge(releaseRequests[0]!.id);
        await sandbox.runRelwolf(branch, config);
      };

      await sandbox.commit(branch, 'chore: Add packages', {
        'cliff.toml': cliffToml('OLD'),
        'packages/api/api.txt': 'a',
        'packages/web/web.txt': 'a',
      });
      await sandbox.commit(branch, 'feat(api): Add endpoint', {
        'packages/api/api.txt': 'b',
      });
      await release();
      await sandbox.commit(branch, 'fix(api): Fix endpoint', {
        'packages/api/api.txt': 'c',
      });
      await release();

      expect(await sandbox.tagExists('v0.1.1')).toBe(true);

      await sandbox.commit(branch, 'fix(api): Fix endpoint again', {
        'cliff.toml': cliffToml('NEW'),
        'packages/api/api.txt': 'd',
      });
      const {releaseRequests} = await sandbox.runRelwolf(branch, config);
      const web = await sandbox.fileContent(
        `relwolf/${branch}`,
        'packages/web/CHANGELOG.md',
      );

      expect(web).toMatch(
        /NEW v0\.1\.2[\s\S]*Nothing here\.[\s\S]*NEW v0\.1\.1[\s\S]*Nothing here\.[\s\S]*NEW v0\.1\.0/,
      );
      expect(web).not.toContain('OLD');
      expect(releaseRequests[0]?.action).toBe('created');
    });

    it('creates numbered pre-releases', async () => {
      const branch = await newBranch();
      const config = 'prerelease: beta\n';

      await sandbox.commit(branch, 'feat: Add search', {'src/search.txt': 'a'});

      const first = await sandbox.runRelwolf(branch, config);

      expect(
        (await sandbox.releaseRequest(first.releaseRequests[0]!.id)).title,
      ).toBe('chore(release): Create release v0.1.0-beta.1');
      await sandbox.merge(first.releaseRequests[0]!.id);
      expect((await sandbox.runRelwolf(branch, config)).tagged).toEqual([
        'v0.1.0-beta.1',
      ]);
      expect(await sandbox.releaseBody('v0.1.0-beta.1')).toContain(
        'Add search',
      );

      await sandbox.commit(branch, 'fix: Handle empty input', {
        'src/search.txt': 'b',
      });
      const second = await sandbox.runRelwolf(branch, config);

      expect(
        (await sandbox.releaseRequest(second.releaseRequests[0]!.id)).title,
      ).toBe('chore(release): Create release v0.1.0-beta.2');
    });

    it('closes the release merge request when its only commit is reverted', async () => {
      const branch = await newBranch();
      const sha = await sandbox.commit(branch, 'feat: Add search', {
        'src/search.txt': 'a',
      });
      const {releaseRequests} = await sandbox.runRelwolf(branch);

      expect((await sandbox.releaseRequest(releaseRequests[0]!.id)).state).toBe(
        'open',
      );

      await sandbox.commit(
        branch,
        `Revert "feat: Add search"\n\nThis reverts commit ${sha}.`,
        {'src/search.txt': 'b'},
      );
      const result = await sandbox.runRelwolf(branch);

      expect(result.releaseRequests[0]).toBeUndefined();
      expect((await sandbox.releaseRequest(releaseRequests[0]!.id)).state).toBe(
        'closed',
      );
    });
  });
}
