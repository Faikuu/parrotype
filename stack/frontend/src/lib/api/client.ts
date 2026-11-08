const BASE: string = import.meta.env.VITE_API_URL ?? '/api';
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

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
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
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
