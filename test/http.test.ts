import {describe, expect, it, vi} from 'vitest';
import {HttpClient, type FetchLike} from '../src/providers/http.js';

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), {status, headers});

function client(responses: (Response | Error)[]) {
  const fetchMock = vi.fn<FetchLike>(async () => {
    const next = responses.shift();

    if (!next) {
      throw new Error('no more responses');
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  });
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const http = new HttpClient('https://api.test', {}, fetchMock, {
    sleep,
    baseDelayMs: 10,
  });

  return {http, fetchMock, sleep};
}

describe('HttpClient retries', () => {
  it('retries 429 and honours Retry-After', async () => {
    const {http, fetchMock, sleep} = client([
      json(429, {}, {'Retry-After': '2'}),
      json(200, {ok: true}),
    ]);
    const response = await http.request('POST', '/x', {body: {}});

    expect(response.data).toEqual({ok: true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('retries 403 with Retry-After (secondary rate limit)', async () => {
    const {http, fetchMock} = client([
      json(403, {}, {'Retry-After': '1'}),
      json(200, {}),
    ]);

    await http.request('GET', '/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a plain 403', async () => {
    const {http, fetchMock} = client([json(403, {message: 'no'})]);

    await expect(http.request('GET', '/x')).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially on 503 for idempotent requests', async () => {
    const {http, sleep} = client([json(503, {}), json(502, {}), json(200, {})]);

    await http.request('GET', '/x');
    expect(sleep.mock.calls.map(c => c[0])).toEqual([10, 20]);
  });

  it('retries network errors for GET', async () => {
    const {http, fetchMock} = client([
      new TypeError('fetch failed'),
      json(200, {}),
    ]);

    await http.request('GET', '/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry server errors or network errors for POST', async () => {
    const failing = client([json(502, {})]);

    await expect(
      failing.http.request('POST', '/x', {body: {}}),
    ).rejects.toThrow(/502/);
    expect(failing.fetchMock).toHaveBeenCalledTimes(1);

    const broken = client([new TypeError('fetch failed')]);

    await expect(broken.http.request('POST', '/x', {body: {}})).rejects.toThrow(
      /fetch failed/,
    );
    expect(broken.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after three retries', async () => {
    const {http, fetchMock} = client([
      json(503, {}),
      json(503, {}),
      json(503, {}),
      json(503, {}),
    ]);

    await expect(http.request('GET', '/x')).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('HttpClient.requestAll', () => {
  it('stops after 10 pages', async () => {
    const pages = Array.from({length: 20}, (_, i) =>
      json(200, [i], {'x-next-page': String(i + 2)}),
    );
    const {http, fetchMock} = client(pages);

    expect(await http.requestAll('/x')).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('returns a single page without pagination headers', async () => {
    const {http, fetchMock} = client([json(200, [1, 2])]);

    expect(await http.requestAll('/x')).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
