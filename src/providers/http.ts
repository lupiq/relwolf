import {ProviderError} from './types.js';

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpResponse {
  status: number;
  data: any;
  headers: Headers;
}

export interface RetryOptions {
  /** Retries after the first attempt. */
  retries?: number;
  /** Delay before the first retry; doubles with every further one. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_RETRY_DELAY_MS = 60_000;
/** Upper bound for paginated lists, i.e. 1000 items at 100 per page. */
const MAX_PAGES = 10;
const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']);

/** The next page number from GitHub's `Link` header or GitLab's `x-next-page` header. */
function nextPage(headers: Headers): string | undefined {
  for (const part of (headers.get('link') ?? '').split(',')) {
    if (!part.includes('rel="next"')) {
      continue;
    }

    const target = /<([^>]+)>/.exec(part)?.[1];
    const page = target && new URL(target).searchParams.get('page');

    if (page) {
      return page;
    }
  }

  const next = headers.get('x-next-page');

  return next === '' ? undefined : (next ?? undefined);
}

export class HttpClient {
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>,
    private readonly fetchImpl: FetchLike = fetch,
    retry: RetryOptions = {},
  ) {
    this.retries = retry.retries ?? 3;
    this.baseDelayMs = retry.baseDelayMs ?? 1000;
    this.sleep =
      retry.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  /** GETs every page of a list endpoint (up to 10 pages) and returns the concatenated items. */
  async requestAll(
    path: string,
    query: Record<string, string> = {},
  ): Promise<unknown[]> {
    const items: unknown[] = [];
    let page: string | undefined;

    for (let count = 0; count < MAX_PAGES; count++) {
      const response = await this.request('GET', path, {
        query: {...query, ...(page ? {page} : {})},
      });

      if (Array.isArray(response.data)) {
        items.push(...response.data);
      }

      page = nextPage(response.headers);

      if (!page) {
        break;
      }
    }

    return items;
  }

  /** Seconds from `Retry-After`, if the server asked us to wait. */
  private retryAfterMs(response: Response): number | undefined {
    const seconds = Number(response.headers.get('retry-after'));

    return Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
      : undefined;
  }

  /**
   * Retries rate limiting (429, or 403 with `Retry-After`) for every method. Server errors and network
   * failures are only retried for idempotent methods, because a POST may have been processed already.
   */
  private async send(
    method: string,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined;
      let delay: number | undefined;

      try {
        response = await this.fetchImpl(url, init);
      } catch (error) {
        if (attempt >= this.retries || !IDEMPOTENT.has(method)) {
          throw error;
        }
      }

      if (response) {
        const rateLimited =
          response.status === 429 ||
          (response.status === 403 && response.headers.has('retry-after'));
        const unavailable = [502, 503, 504].includes(response.status);

        if (
          attempt >= this.retries ||
          !(rateLimited || (unavailable && IDEMPOTENT.has(method)))
        ) {
          return response;
        }

        delay = this.retryAfterMs(response);
      }

      await this.sleep(delay ?? this.baseDelayMs * 2 ** attempt);
    }
  }

  /** Throws a ProviderError for any status that is neither 2xx nor listed in `allow`. */
  async request(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      body?: unknown;
      allow?: number[];
    } = {},
  ): Promise<HttpResponse> {
    const url = new URL(this.baseUrl.replace(/\/+$/, '') + path);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.send(method, url.toString(), {
      method,
      headers: {
        ...this.headers,
        ...(options.body !== undefined
          ? {'Content-Type': 'application/json'}
          : {}),
      },
      ...(options.body !== undefined
        ? {body: JSON.stringify(options.body)}
        : {}),
    });

    const text = await response.text();
    let data: any = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok && !(options.allow ?? []).includes(response.status)) {
      const detail = typeof data === 'string' ? data : JSON.stringify(data);

      throw new ProviderError(
        `${method} ${url.pathname} failed with ${response.status}: ${detail.slice(0, 500)}`,
        response.status,
      );
    }

    return {status: response.status, data, headers: response.headers};
  }
}
