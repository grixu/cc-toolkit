export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Defaults to `'follow'`. */
  redirect?: 'follow' | 'manual' | 'error';
  timeoutMs?: number;
}

export interface FetchkitResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export declare class FetchkitError extends Error {
  readonly code: 'redirect' | 'too-many-redirects' | 'timeout';
}

export declare function request(url: string, options?: RequestOptions): Promise<FetchkitResponse>;
