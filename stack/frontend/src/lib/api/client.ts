/** The API base: a path (default /api) or an absolute URL from VITE_API_URL. */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';
const BASE = API_BASE;
const NETWORK_MESSAGE = "Couldn't reach the server. Check that the backend is running.";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message: unknown }).message;
      if (Array.isArray(msg)) return msg.map(String).join(', ');
      if (typeof msg === 'string') return msg;
    }
  } catch {
    // not JSON, fall through
  }
  return res.statusText || `Request failed (${res.status})`;
}

/** Sends a request and throws ApiError for any non-2xx status. The body is not read. */
async function send(path: string, opts: ApiOptions, accept: string): Promise<Response> {
  const { method = 'GET', body, signal } = opts;
  const headers: Record<string, string> = { Accept: accept };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  return res;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await send(path, opts, 'application/json');
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A file download. The name comes from Content-Disposition when the server sends one. */
export async function apiBlob(
  path: string,
  opts: ApiOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await send(path, opts, '*/*');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await res.blob(), filename: match?.[1] ?? null };
}
