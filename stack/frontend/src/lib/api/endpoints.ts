import type { Language, QuoteLength } from '@/lib/engine/types';
import { api, apiBlob } from './client';
import type {
  ExportFormat,
  Insights,
  LeaderboardEntry,
  LeaderboardQuery,
  PublicProfile,
  PublicUser,
  Quote,
  Result,
  ResultInput,
  Summary,
} from './types';

export const authApi = {
  register: (input: { name: string; email: string; password: string }) =>
    api<{ user: PublicUser }>('/auth/register', { method: 'POST', body: input }),
  login: (input: { email: string; password: string }) =>
    api<{ user: PublicUser }>('/auth/login', { method: 'POST', body: input }),
  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => api<{ user: PublicUser }>('/auth/me', { signal }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    api<{ ok: true }>('/auth/password', { method: 'PATCH', body: input }),
  deleteAccount: (input: { password: string }) =>
    api<{ ok: true }>('/auth/account', { method: 'DELETE', body: input }),
};

export const quotesApi = {
  random: (params: { language: Language; length: QuoteLength }, signal?: AbortSignal) =>
    api<Quote>(`/quotes/random?${new URLSearchParams(params).toString()}`, { signal }),
};

export const resultsApi = {
  submit: (input: ResultInput) => api<Result>('/results', { method: 'POST', body: input }),
  mine: (limit = 50, signal?: AbortSignal) =>
    api<Result[]>(`/results/me?limit=${limit}`, { signal }),
  summary: (signal?: AbortSignal) => api<Summary>('/results/me/summary', { signal }),
  insights: (signal?: AbortSignal) => api<Insights>('/results/me/insights', { signal }),
  /** Throttled to 5 a minute by the server: a 429 ApiError means too many downloads. */
  export: (format: ExportFormat, signal?: AbortSignal) =>
    apiBlob(`/results/me/export?format=${format}`, { signal }),
};

export const leaderboardApi = {
  get: (query: LeaderboardQuery, signal?: AbortSignal) =>
    api<LeaderboardEntry[]>(`/leaderboard?${new URLSearchParams(query).toString()}`, { signal }),
};

export const usersApi = {
  profile: (name: string, signal?: AbortSignal) =>
    api<PublicProfile>(`/users/${encodeURIComponent(name)}`, { signal }),
};
