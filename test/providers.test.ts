import {describe, expect, it, vi} from 'vitest';
import {GitHubProvider} from '../src/providers/github.js';
import {GitLabProvider} from '../src/providers/gitlab.js';
import {createProviderFromEnv} from '../src/providers/index.js';
import {ProviderError} from '../src/providers/types.js';

interface Call {
  method: string;
  url: URL;
  body: any;
  headers: Record<string, string>;
}

function mockFetch(
  handler: (call: Call) => {status?: number; json?: unknown} | undefined,
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: new URL(input),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: init?.headers as Record<string, string>,
    };
    calls.push(call);
    const result = handler(call) ?? {status: 200, json: {}};
    const status = result.status ?? 200;
    return new Response(
      result.json === undefined ? null : JSON.stringify(result.json),
      {status},
    );
  });
  return {calls, fetch: fetchMock};
}

const gitlabMr = (overrides: object = {}) => ({
  iid: 7,
  title: 't',
  description: 'd',
  web_url: 'https://gl/mr/7',
  state: 'opened',
  labels: ['relwolf: pending'],
  merge_commit_sha: null,
  squash_commit_sha: null,
  sha: 'headsha',
  ...overrides,
});

describe('GitLabProvider', () => {
  const make = (handler: Parameters<typeof mockFetch>[0]) => {
    const mock = mockFetch(handler);
    const provider = new GitLabProvider({
      apiUrl: 'https://gl.example.com/api/v4/',
      projectId: 'group/project',
      token: 'secret',
      fetch: mock.fetch,
    });
    return {provider, calls: mock.calls};
  };

  it('authenticates with the PAT and encodes the project', async () => {
    const {provider, calls} = make(() => ({json: []}));
    await provider.findOpenReleaseRequest({
      sourceBranch: 'relwolf/main',
      targetBranch: 'main',
    });
    expect(calls[0]!.headers['PRIVATE-TOKEN']).toBe('secret');
    expect(calls[0]!.url.pathname).toBe(
      '/api/v4/projects/group%2Fproject/merge_requests',
    );
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      state: 'opened',
      source_branch: 'relwolf/main',
      target_branch: 'main',
    });
  });

  it('maps merge requests', async () => {
    const {provider} = make(() => ({json: [gitlabMr()]}));
    expect(
      await provider.findOpenReleaseRequest({
        sourceBranch: 'a',
        targetBranch: 'b',
      }),
    ).toEqual({
      id: 7,
      title: 't',
      body: 'd',
      url: 'https://gl/mr/7',
      state: 'open',
      labels: ['relwolf: pending'],
      mergeSha: 'headsha',
    });
  });

  it('returns null when no merge request is open', async () => {
    const {provider} = make(() => ({json: []}));
    expect(
      await provider.findOpenReleaseRequest({
        sourceBranch: 'a',
        targetBranch: 'b',
      }),
    ).toBeNull();
  });

  it('prefers the merge commit, then the squash commit, as merge sha', async () => {
    const {provider} = make(() => ({
      json: [
        gitlabMr({
          state: 'merged',
          merge_commit_sha: 'm',
          squash_commit_sha: 's',
        }),
        gitlabMr({iid: 8, state: 'merged', squash_commit_sha: 's'}),
        gitlabMr({iid: 9, state: 'merged', sha: null}),
      ],
    }));
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });
    expect(result.map(r => [r.state, r.mergeSha])).toEqual([
      ['merged', 'm'],
      ['merged', 's'],
      ['merged', undefined],
    ]);
  });

  it('queries merged requests by label and target branch', async () => {
    const {provider, calls} = make(() => ({json: []}));
    await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      state: 'merged',
      target_branch: 'main',
      labels: 'relwolf: pending',
    });
  });

  it('creates merge requests with labels and source branch removal', async () => {
    const {provider, calls} = make(() => ({status: 201, json: gitlabMr()}));
    const created = await provider.createReleaseRequest({
      sourceBranch: 'relwolf/main',
      targetBranch: 'main',
      title: 'T',
      body: 'B',
      labels: ['relwolf: pending'],
    });
    expect(created.id).toBe(7);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      source_branch: 'relwolf/main',
      target_branch: 'main',
      title: 'T',
      description: 'B',
      labels: 'relwolf: pending',
      remove_source_branch: true,
    });
  });

  it('closes merge requests', async () => {
    const {provider, calls} = make(() => ({json: gitlabMr()}));
    await provider.closeReleaseRequest(7);
    expect([calls[0]!.method, calls[0]!.url.pathname, calls[0]!.body]).toEqual([
      'PUT',
      expect.stringMatching(/merge_requests\/7$/),
      {state_event: 'close'},
    ]);
  });

  it('updates title/body and labels', async () => {
    const {provider, calls} = make(() => ({json: gitlabMr()}));
    await provider.updateReleaseRequest(7, {title: 'T', body: 'B'});
    await provider.setLabels(7, {
      add: ['relwolf: tagged'],
      remove: ['relwolf: pending'],
    });
    expect(
      calls.map(c => [
        c.method,
        c.url.pathname.split('/').slice(-2).join('/'),
        c.body,
      ]),
    ).toEqual([
      ['PUT', 'merge_requests/7', {title: 'T', description: 'B'}],
      [
        'PUT',
        'merge_requests/7',
        {add_labels: 'relwolf: tagged', remove_labels: 'relwolf: pending'},
      ],
    ]);
  });

  it('force-commits on top of the base sha', async () => {
    const {provider, calls} = make(() => ({status: 201, json: {}}));
    await provider.commitFiles({
      branch: 'relwolf/main',
      baseSha: 'abc',
      message: 'msg',
      files: [
        {path: 'CHANGELOG.md', content: 'c', exists: false},
        {path: 'package.json', content: 'p', exists: true},
      ],
    });
    expect(calls[0]!.url.pathname).toBe(
      '/api/v4/projects/group%2Fproject/repository/commits',
    );
    expect(calls[0]!.body).toEqual({
      branch: 'relwolf/main',
      start_sha: 'abc',
      force: true,
      commit_message: 'msg',
      actions: [
        {
          action: 'create',
          file_path: 'CHANGELOG.md',
          content: 'c',
          encoding: 'text',
        },
        {
          action: 'update',
          file_path: 'package.json',
          content: 'p',
          encoding: 'text',
        },
      ],
    });
  });

  it('creates labels only when missing', async () => {
    const label = {name: 'relwolf: pending', color: 'fbca04', description: 'd'};
    const missing = make(call =>
      call.method === 'GET'
        ? {status: 404, json: {message: '404'}}
        : {status: 201, json: {}},
    );
    await missing.provider.ensureLabel(label);
    expect(missing.calls.map(c => c.method)).toEqual(['GET', 'POST']);
    expect(missing.calls[0]!.url.pathname).toContain(
      '/labels/relwolf%3A%20pending',
    );
    expect(missing.calls[1]!.body).toEqual({
      name: 'relwolf: pending',
      color: '#fbca04',
      description: 'd',
    });

    const present = make(() => ({json: {}}));
    await present.provider.ensureLabel(label);
    expect(present.calls.map(c => c.method)).toEqual(['GET']);
  });

  it('creates tags and treats existing tags as success', async () => {
    const created = make(() => ({status: 201, json: {}}));
    expect(await created.provider.createTag('v1.0.0', 'sha')).toBe('created');
    expect(created.calls[0]!.body).toEqual({tag_name: 'v1.0.0', ref: 'sha'});

    const exists = make(() => ({
      status: 409,
      json: {message: 'Tag v1.0.0 already exists'},
    }));
    expect(await exists.provider.createTag('v1.0.0', 'sha')).toBe('exists');

    const existsAs400 = make(() => ({
      status: 400,
      json: {message: 'Tag v1.0.0 already exists'},
    }));
    expect(await existsAs400.provider.createTag('v1.0.0', 'sha')).toBe(
      'exists',
    );

    const broken = make(() => ({
      status: 400,
      json: {message: 'Target sha not found'},
    }));
    await expect(
      broken.provider.createTag('v1.0.0', 'sha'),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('checks and creates releases', async () => {
    const absent = make(() => ({
      status: 404,
      json: {message: '404 Not Found'},
    }));
    expect(await absent.provider.releaseExists('v1.0.0')).toBe(false);
    const present = make(() => ({json: {tag_name: 'v1.0.0'}}));
    expect(await present.provider.releaseExists('v1.0.0')).toBe(true);

    const create = make(() => ({status: 201, json: {}}));
    await create.provider.createRelease({
      tag: 'v1.0.0',
      name: 'v1.0.0',
      body: 'notes',
      prerelease: true,
    });
    expect(create.calls[0]!.body).toEqual({
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      description: 'notes',
    });
  });

  it('reports API errors without leaking the token', async () => {
    const {provider} = make(() => ({
      status: 401,
      json: {message: '401 Unauthorized'},
    }));
    const error = await provider.releaseExists('v1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(401);
    expect((error as Error).message).toContain('401 Unauthorized');
    expect((error as Error).message).not.toContain('secret');
  });
});

const ghPull = (overrides: object = {}) => ({
  number: 3,
  title: 't',
  body: 'b',
  html_url: 'https://gh/pull/3',
  state: 'open',
  merged_at: null,
  merge_commit_sha: null,
  labels: [{name: 'relwolf: pending'}],
  base: {ref: 'main'},
  ...overrides,
});

describe('GitHubProvider', () => {
  const make = (handler: Parameters<typeof mockFetch>[0]) => {
    const mock = mockFetch(handler);
    const provider = new GitHubProvider({
      apiUrl: 'https://api.github.com',
      repository: 'lupiq/relwolf',
      token: 'secret',
      fetch: mock.fetch,
    });
    return {provider, calls: mock.calls};
  };

  it('rejects malformed repositories', () => {
    expect(
      () => new GitHubProvider({apiUrl: 'x', repository: 'nope', token: 't'}),
    ).toThrow(/owner\/name/);
  });

  it('authenticates and finds open pull requests by head branch', async () => {
    const {provider, calls} = make(() => ({json: [ghPull()]}));
    const found = await provider.findOpenReleaseRequest({
      sourceBranch: 'relwolf/main',
      targetBranch: 'main',
    });
    expect(found).toMatchObject({
      id: 3,
      state: 'open',
      labels: ['relwolf: pending'],
    });
    expect(calls[0]!.headers.Authorization).toBe('Bearer secret');
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      head: 'lupiq:relwolf/main',
      base: 'main',
      state: 'open',
    });
  });

  it('creates pull requests and then attaches labels', async () => {
    const {provider, calls} = make(call =>
      call.url.pathname.endsWith('/pulls')
        ? {status: 201, json: ghPull({labels: []})}
        : {json: []},
    );
    const created = await provider.createReleaseRequest({
      sourceBranch: 'relwolf/main',
      targetBranch: 'main',
      title: 'T',
      body: 'B',
      labels: ['relwolf: pending'],
    });
    expect(created.labels).toEqual(['relwolf: pending']);
    expect(calls[0]!.body).toEqual({
      title: 'T',
      head: 'relwolf/main',
      base: 'main',
      body: 'B',
    });
    expect(calls[1]!.url.pathname).toBe('/repos/lupiq/relwolf/issues/3/labels');
    expect(calls[1]!.body).toEqual({labels: ['relwolf: pending']});
  });

  it('only returns merged pull requests of the target branch', async () => {
    const {provider} = make(call => {
      const path = call.url.pathname;
      if (path.endsWith('/issues')) {
        return {
          json: [
            {number: 1, pull_request: {}},
            {number: 2, pull_request: {}},
            {number: 3, pull_request: {}},
            {number: 4},
          ],
        };
      }
      if (path.endsWith('/pulls/1'))
        return {
          json: ghPull({
            number: 1,
            state: 'closed',
            merged_at: '2026-01-01',
            merge_commit_sha: 'sha1',
          }),
        };
      if (path.endsWith('/pulls/2'))
        return {json: ghPull({number: 2, state: 'closed', merged_at: null})};
      if (path.endsWith('/pulls/3'))
        return {
          json: ghPull({
            number: 3,
            state: 'closed',
            merged_at: '2026-01-01',
            base: {ref: 'other'},
          }),
        };
      throw new Error(`unexpected ${path}`);
    });
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id: 1, state: 'merged', mergeSha: 'sha1'});
  });

  it('swaps labels', async () => {
    const {provider, calls} = make(() => ({json: []}));
    await provider.setLabels(3, {
      add: ['relwolf: tagged'],
      remove: ['relwolf: pending'],
    });
    expect(calls.map(c => [c.method, c.url.pathname])).toEqual([
      ['POST', '/repos/lupiq/relwolf/issues/3/labels'],
      ['DELETE', '/repos/lupiq/relwolf/issues/3/labels/relwolf%3A%20pending'],
    ]);
  });

  it('commits through the git data API, creating the branch when missing', async () => {
    const {provider, calls} = make(call => {
      const {method, url} = call;
      if (url.pathname.endsWith('/git/commits/base'))
        return {json: {tree: {sha: 'basetree'}}};
      if (url.pathname.endsWith('/git/trees'))
        return {status: 201, json: {sha: 'newtree'}};
      if (url.pathname.endsWith('/git/commits'))
        return {status: 201, json: {sha: 'newcommit'}};
      if (method === 'GET') return {status: 404, json: {message: 'Not Found'}};
      return {status: 201, json: {}};
    });
    await provider.commitFiles({
      branch: 'relwolf/main',
      baseSha: 'base',
      message: 'msg',
      files: [{path: 'a.txt', content: 'x', exists: false}],
    });
    expect(calls.map(c => `${c.method} ${c.url.pathname}`)).toEqual([
      'GET /repos/lupiq/relwolf/git/commits/base',
      'POST /repos/lupiq/relwolf/git/trees',
      'POST /repos/lupiq/relwolf/git/commits',
      'GET /repos/lupiq/relwolf/git/ref/heads/relwolf/main',
      'POST /repos/lupiq/relwolf/git/refs',
    ]);
    expect(calls[1]!.body).toEqual({
      base_tree: 'basetree',
      tree: [{path: 'a.txt', mode: '100644', type: 'blob', content: 'x'}],
    });
    expect(calls[2]!.body).toEqual({
      message: 'msg',
      tree: 'newtree',
      parents: ['base'],
    });
    expect(calls[4]!.body).toEqual({
      ref: 'refs/heads/relwolf/main',
      sha: 'newcommit',
    });
  });

  it('force-updates an existing branch', async () => {
    const {provider, calls} = make(call => {
      const {url} = call;
      if (url.pathname.endsWith('/git/commits/base'))
        return {json: {tree: {sha: 't'}}};
      if (url.pathname.endsWith('/git/trees'))
        return {status: 201, json: {sha: 'nt'}};
      if (url.pathname.endsWith('/git/commits'))
        return {status: 201, json: {sha: 'nc'}};
      return {json: {}};
    });
    await provider.commitFiles({
      branch: 'relwolf/main',
      baseSha: 'base',
      message: 'm',
      files: [],
    });
    const last = calls.at(-1)!;
    expect([last.method, last.url.pathname, last.body]).toEqual([
      'PATCH',
      '/repos/lupiq/relwolf/git/refs/heads/relwolf/main',
      {sha: 'nc', force: true},
    ]);
  });

  it('creates tags, releases and labels', async () => {
    const tag = make(() => ({status: 201, json: {}}));
    expect(await tag.provider.createTag('v1.0.0', 'sha')).toBe('created');
    expect(tag.calls[0]!.body).toEqual({ref: 'refs/tags/v1.0.0', sha: 'sha'});

    const exists = make(() => ({
      status: 422,
      json: {message: 'Reference already exists'},
    }));
    expect(await exists.provider.createTag('v1.0.0', 'sha')).toBe('exists');

    const broken = make(() => ({
      status: 422,
      json: {message: 'Object does not exist'},
    }));
    await expect(broken.provider.createTag('v1.0.0', 'sha')).rejects.toThrow(
      /Could not create tag/,
    );

    const release = make(() => ({status: 201, json: {}}));
    await release.provider.createRelease({
      tag: 'v1.0.0',
      name: 'v1.0.0',
      body: 'n',
      prerelease: true,
    });
    expect(release.calls[0]!.body).toEqual({
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      body: 'n',
      prerelease: true,
    });

    const absent = make(() => ({status: 404, json: {}}));
    expect(await absent.provider.releaseExists('v1')).toBe(false);

    const missingLabel = make(call =>
      call.method === 'GET' ? {status: 404, json: {}} : {status: 201, json: {}},
    );
    await missingLabel.provider.ensureLabel({
      name: 'x',
      color: 'ffffff',
      description: 'd',
    });
    expect(missingLabel.calls[1]!.body).toEqual({
      name: 'x',
      color: 'ffffff',
      description: 'd',
    });
  });

  it('closes pull requests', async () => {
    const {provider, calls} = make(() => ({json: {}}));
    await provider.closeReleaseRequest(3);
    expect([calls[0]!.method, calls[0]!.url.pathname, calls[0]!.body]).toEqual([
      'PATCH',
      '/repos/lupiq/relwolf/pulls/3',
      {state: 'closed'},
    ]);
  });

  it('updates pull requests', async () => {
    const {provider, calls} = make(() => ({json: {}}));
    await provider.updateReleaseRequest(3, {title: 'T', body: 'B'});
    expect([calls[0]!.method, calls[0]!.url.pathname, calls[0]!.body]).toEqual([
      'PATCH',
      '/repos/lupiq/relwolf/pulls/3',
      {title: 'T', body: 'B'},
    ]);
  });
});

describe('createProviderFromEnv', () => {
  it('requires a token', () => {
    expect(() => createProviderFromEnv({GITLAB_CI: 'true'})).toThrow(
      /RELWOLF_TOKEN/,
    );
  });

  it('configures GitLab from CI variables', () => {
    const ctx = createProviderFromEnv({
      GITLAB_CI: 'true',
      RELWOLF_TOKEN: 't',
      CI_API_V4_URL: 'https://gl/api/v4',
      CI_PROJECT_ID: '42',
      CI_COMMIT_BRANCH: 'main',
      CI_DEFAULT_BRANCH: 'main',
    });
    expect(ctx.provider.name).toBe('gitlab');
    expect(ctx.currentBranch).toBe('main');
    expect(ctx.defaultBranch).toBe('main');
  });

  it('reports non-branch GitLab pipelines with an empty branch', () => {
    const ctx = createProviderFromEnv({
      GITLAB_CI: 'true',
      RELWOLF_TOKEN: 't',
      CI_API_V4_URL: 'u',
      CI_PROJECT_ID: '1',
    });
    expect(ctx.currentBranch).toBe('');
  });

  it('configures GitHub from Actions variables', () => {
    const ctx = createProviderFromEnv({
      GITHUB_ACTIONS: 'true',
      RELWOLF_TOKEN: 't',
      GITHUB_REPOSITORY: 'lupiq/relwolf',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
    });
    expect(ctx.provider.name).toBe('github');
    expect(ctx.currentBranch).toBe('main');
    expect(
      createProviderFromEnv({
        GITHUB_ACTIONS: 'true',
        RELWOLF_TOKEN: 't',
        GITHUB_REPOSITORY: 'a/b',
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: 'v1',
      }).currentBranch,
    ).toBe('');
  });

  it('allows an explicit provider and rejects unknown ones', () => {
    const env = {RELWOLF_TOKEN: 't', GITHUB_REPOSITORY: 'a/b'};
    expect(
      createProviderFromEnv({...env, RELWOLF_PROVIDER: 'github'}).provider.name,
    ).toBe('github');
    expect(() =>
      createProviderFromEnv({...env, RELWOLF_PROVIDER: 'bitbucket'}),
    ).toThrow(/gitlab" or "github/);
    expect(() => createProviderFromEnv(env)).toThrow(/Could not detect/);
  });
});
