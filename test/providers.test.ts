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
  handler: (
    call: Call,
  ) =>
    | {status?: number; json?: unknown; headers?: Record<string, string>}
    | undefined,
) {
  const calls: Array<Call> = [];
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
      {status, ...(result.headers ? {headers: result.headers} : {})},
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
  source_branch: 'relwolf/main',
  source_project_id: 1,
  target_project_id: 1,
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

  it('follows x-next-page when listing merged merge requests', async () => {
    const {provider, calls} = make(call =>
      call.url.searchParams.get('page') === '2'
        ? {json: [gitlabMr({iid: 2})]}
        : {json: [gitlabMr({iid: 1})], headers: {'x-next-page': '2'}},
    );
    const merged = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });

    expect(merged.map(m => m.id)).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
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
      draft: false,
      mergeSha: 'headsha',
      sourceBranch: 'relwolf/main',
      fork: false,
    });
  });

  it('detects merge requests from forks', async () => {
    const {provider} = make(() => ({
      json: [
        gitlabMr({state: 'merged'}),
        gitlabMr({iid: 8, state: 'merged', source_project_id: 2}),
      ],
    }));
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });

    expect(result.map(r => r.fork)).toEqual([false, true]);
  });

  it('strips the draft prefix and keeps drafts on update', async () => {
    const {provider, calls} = make(() => ({
      json: [gitlabMr({title: 'Draft: t'})],
    }));
    const found = await provider.findOpenReleaseRequest({
      sourceBranch: 'a',
      targetBranch: 'b',
    });

    expect(found).toMatchObject({title: 't', draft: true});

    await provider.updateReleaseRequest(7, {
      title: 't2',
      body: 'b',
      draft: true,
    });
    expect(calls.at(-1)!.body).toMatchObject({title: 'Draft: t2'});
  });

  it('creates draft merge requests with assignees and reviewers by username', async () => {
    const {provider, calls} = make(call =>
      call.url.pathname.endsWith('/users')
        ? {
            json: [
              {id: call.url.searchParams.get('username') === 'bob' ? 2 : 1},
            ],
          }
        : {status: 201, json: gitlabMr()},
    );

    await provider.createReleaseRequest({
      sourceBranch: 's',
      targetBranch: 'main',
      title: 'T',
      body: 'B',
      labels: [],
      draft: true,
      assignees: ['alice'],
      reviewers: ['bob'],
    });
    expect(calls.at(-1)!.body).toMatchObject({
      title: 'Draft: T',
      assignee_ids: [1],
      reviewer_ids: [2],
    });
  });

  it('fails for unknown users', async () => {
    const {provider} = make(() => ({json: []}));

    await expect(
      provider.createReleaseRequest({
        sourceBranch: 's',
        targetBranch: 'main',
        title: 'T',
        body: 'B',
        labels: [],
        draft: false,
        assignees: ['ghost'],
        reviewers: [],
      }),
    ).rejects.toThrow(/ghost/);
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
      draft: false,
      assignees: [],
      reviewers: [],
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

  it('creates tags and reports the commit of existing tags', async () => {
    const created = make(() => ({status: 201, json: {}}));

    expect(await created.provider.createTag('v1.0.0', 'sha')).toEqual({
      created: true,
      sha: 'sha',
    });
    expect(created.calls[0]!.body).toEqual({tag_name: 'v1.0.0', ref: 'sha'});

    const existing = (status: number) =>
      make(call =>
        call.method === 'POST'
          ? {status, json: {message: 'Tag pkg/v1.0.0 already exists'}}
          : {json: {name: 'pkg/v1.0.0', commit: {id: 'other'}}},
      );
    const exists = existing(409);

    expect(await exists.provider.createTag('pkg/v1.0.0', 'sha')).toEqual({
      created: false,
      sha: 'other',
    });
    expect(exists.calls[1]!.url.pathname).toBe(
      '/api/v4/projects/group%2Fproject/repository/tags/pkg%2Fv1.0.0',
    );

    expect(await existing(400).provider.createTag('pkg/v1.0.0', 'sha')).toEqual(
      {created: false, sha: 'other'},
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
  head: {ref: 'relwolf/main', repo: {id: 1}},
  base: {ref: 'main', repo: {id: 1}},
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

  it('creates draft pull requests with assignees and reviewers', async () => {
    const {provider, calls} = make(call =>
      call.url.pathname.endsWith('/pulls')
        ? {status: 201, json: ghPull({labels: [], draft: true})}
        : {json: {}},
    );
    const created = await provider.createReleaseRequest({
      sourceBranch: 's',
      targetBranch: 'main',
      title: 'T',
      body: 'B',
      labels: [],
      draft: true,
      assignees: ['alice'],
      reviewers: ['bob'],
    });

    expect(created.draft).toBe(true);
    expect(calls[0]!.body).toMatchObject({draft: true});
    expect(calls.map(c => c.url.pathname)).toEqual(
      expect.arrayContaining([
        '/repos/lupiq/relwolf/issues/3/assignees',
        '/repos/lupiq/relwolf/pulls/3/requested_reviewers',
      ]),
    );
    expect(
      calls.find(c => c.url.pathname.endsWith('/assignees'))!.body,
    ).toEqual({assignees: ['alice']});
    expect(
      calls.find(c => c.url.pathname.endsWith('/requested_reviewers'))!.body,
    ).toEqual({reviewers: ['bob']});
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
      draft: false,
      assignees: [],
      reviewers: [],
    });

    expect(created.labels).toEqual(['relwolf: pending']);
    expect(calls[0]!.body).toEqual({
      title: 'T',
      head: 'relwolf/main',
      base: 'main',
      body: 'B',
      draft: false,
    });
    expect(calls[1]!.url.pathname).toBe('/repos/lupiq/relwolf/issues/3/labels');
    expect(calls[1]!.body).toEqual({labels: ['relwolf: pending']});
  });

  it('only returns merged, labelled pull requests of the target branch, oldest first', async () => {
    const {provider, calls} = make(() => ({
      json: [
        ghPull({
          number: 1,
          state: 'closed',
          merged_at: '2026-02-01T00:00:00Z',
          merge_commit_sha: 'sha1',
        }),
        ghPull({number: 2, state: 'closed', merged_at: null}),
        ghPull({
          number: 3,
          state: 'closed',
          merged_at: '2026-01-01T00:00:00Z',
          labels: [{name: 'relwolf: pending'}, {name: 'other'}],
        }),
        ghPull({
          number: 4,
          state: 'closed',
          merged_at: '2026-01-01T00:00:00Z',
          labels: [{name: 'relwolf: tagged'}],
        }),
      ],
    }));
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });

    expect(result.map(r => r.id)).toEqual([3, 1]);
    expect(result[1]).toMatchObject({state: 'merged', mergeSha: 'sha1'});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/repos/lupiq/relwolf/pulls');
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      state: 'closed',
      base: 'main',
    });
  });

  it('maps the head branch and detects pull requests from forks', async () => {
    const merged = {state: 'closed', merged_at: '2026-01-01'};
    const {provider} = make(() => ({
      json: [
        ghPull({number: 1, ...merged}),
        ghPull({
          number: 2,
          ...merged,
          head: {ref: 'relwolf/main', repo: {id: 2}},
        }),
        ghPull({number: 3, ...merged, head: {ref: 'x', repo: null}}),
      ],
    }));
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });

    expect(result.map(r => [r.sourceBranch, r.fork])).toEqual([
      ['relwolf/main', false],
      ['relwolf/main', true],
      ['x', true],
    ]);
  });

  it('follows the Link header when listing closed pull requests', async () => {
    const {provider, calls} = make(call =>
      call.url.searchParams.get('page') === '2'
        ? {
            json: [
              ghPull({number: 2, state: 'closed', merged_at: '2026-01-02'}),
            ],
          }
        : {
            json: [
              ghPull({number: 1, state: 'closed', merged_at: '2026-01-01'}),
            ],
            headers: {
              Link: '<https://api.github.com/repos/lupiq/relwolf/pulls?page=2>; rel="next", <https://api.github.com/repos/lupiq/relwolf/pulls?page=2>; rel="last"',
            },
          },
    );
    const result = await provider.listMergedReleaseRequests({
      targetBranch: 'main',
      label: 'relwolf: pending',
    });

    expect(result.map(r => r.id)).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
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

      if (url.pathname.endsWith('/git/commits/base')) {
        return {json: {tree: {sha: 'basetree'}}};
      }

      if (url.pathname.endsWith('/git/trees')) {
        return {status: 201, json: {sha: 'newtree'}};
      }

      if (url.pathname.endsWith('/git/commits')) {
        return {status: 201, json: {sha: 'newcommit'}};
      }

      if (method === 'GET') {
        return {status: 404, json: {message: 'Not Found'}};
      }

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

      if (url.pathname.endsWith('/git/commits/base')) {
        return {json: {tree: {sha: 't'}}};
      }

      if (url.pathname.endsWith('/git/trees')) {
        return {status: 201, json: {sha: 'nt'}};
      }

      if (url.pathname.endsWith('/git/commits')) {
        return {status: 201, json: {sha: 'nc'}};
      }

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

    expect(await tag.provider.createTag('v1.0.0', 'sha')).toEqual({
      created: true,
      sha: 'sha',
    });
    expect(tag.calls[0]!.body).toEqual({ref: 'refs/tags/v1.0.0', sha: 'sha'});

    const exists = make(call => {
      if (call.method === 'POST') {
        return {status: 422, json: {message: 'Reference already exists'}};
      }

      return call.url.pathname.endsWith('/git/ref/tags/pkg/v1.0.0')
        ? {json: {object: {type: 'tag', sha: 'tagobject'}}}
        : {json: {object: {type: 'commit', sha: 'other'}}};
    });

    expect(await exists.provider.createTag('pkg/v1.0.0', 'sha')).toEqual({
      created: false,
      sha: 'other',
    });
    expect(exists.calls.slice(1).map(c => c.url.pathname)).toEqual([
      '/repos/lupiq/relwolf/git/ref/tags/pkg/v1.0.0',
      '/repos/lupiq/relwolf/git/tags/tagobject',
    ]);

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

describe('error messages', () => {
  const gitlab = (status: number, fetch?: typeof globalThis.fetch) =>
    new GitLabProvider({
      apiUrl: 'https://gl.example.com/api/v4',
      projectId: '42',
      token: 'secret',
      fetch:
        fetch ?? mockFetch(() => ({status, json: {message: 'nope'}})).fetch,
    });
  const github = (status: number) =>
    new GitHubProvider({
      apiUrl: 'https://api.github.com',
      repository: 'lupiq/relwolf',
      token: 'secret',
      fetch: mockFetch(() => ({status, json: {message: 'nope'}})).fetch,
    });
  const message = async (promise: Promise<unknown>) =>
    ((await promise.catch((e: unknown) => e)) as Error).message;

  it('explains missing GitLab token permissions', async () => {
    expect(await message(gitlab(401).ensureLabel(label))).toMatch(
      /rejected RELWOLF_TOKEN.*"api" scope/s,
    );
    expect(await message(gitlab(403).ensureLabel(label))).toMatch(
      /Developer or higher/,
    );
    expect(await message(gitlab(404).ensureLabel(label))).toMatch(
      /CI_PROJECT_ID/,
    );
    expect(
      await message(
        gitlab(403).commitFiles({
          branch: 'relwolf/main',
          baseSha: 'a',
          message: 'm',
          files: [{path: 'a', content: 'b', exists: false}],
        }),
      ),
    ).toMatch(/protected branch/);
    expect(await message(gitlab(403).createTag('v1', 'sha'))).toMatch(
      /Protected tags/,
    );
  });

  it('explains missing GitHub token permissions', async () => {
    expect(await message(github(401).ensureLabel(label))).toMatch(
      /rejected the token/,
    );
    expect(await message(github(403).ensureLabel(label))).toMatch(
      /pull requests.*GITHUB_TOKEN/s,
    );
    expect(await message(github(404).ensureLabel(label))).toMatch(
      /cannot access the repository/,
    );
    expect(await message(github(500).ensureLabel(label))).not.toMatch(/Hint/);
  });

  it('reports unreachable servers', async () => {
    const provider = gitlab(
      0,
      vi.fn(async () => {
        throw new TypeError('fetch failed', {cause: new Error('ENOTFOUND')});
      }),
    );
    const text = await message(provider.releaseExists('v1'));

    expect(text).toMatch(/could not reach https:\/\/gl\.example\.com/);
    expect(text).toMatch(/ENOTFOUND/);
    expect(text).not.toMatch(/secret/);
  });

  it('explains missing environment variables', () => {
    expect(() => createProviderFromEnv({GITLAB_CI: 'true'})).toThrow(
      /RELWOLF_TOKEN.*masked CI\/CD variable/s,
    );
    expect(() =>
      createProviderFromEnv({GITLAB_CI: 'true', RELWOLF_TOKEN: 't'}),
    ).toThrow(/set by the CI platform/);
  });
});

const label = {name: 'l', color: '000000', description: 'd'};
