import { ProviderError } from "./types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpResponse {
  status: number;
  data: any;
}

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Throws a ProviderError for any status that is neither 2xx nor listed in `allow`. */
  async request(
    method: string,
    path: string,
    options: { query?: Record<string, string>; body?: unknown; allow?: number[] } = {},
  ): Promise<HttpResponse> {
    const url = new URL(this.baseUrl.replace(/\/+$/, "") + path);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        ...this.headers,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
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
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new ProviderError(
        `${method} ${url.pathname} failed with ${response.status}: ${detail.slice(0, 500)}`,
        response.status,
      );
    }
    return { status: response.status, data };
  }
}
