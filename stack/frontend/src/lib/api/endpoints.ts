import type { Language, QuoteLength } from '@/lib/engine/types';
import { api } from './client';
import type {
  LeaderboardEntry,
  LeaderboardQuery,
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
};

export const leaderboardApi = {
  get: (query: LeaderboardQuery, signal?: AbortSignal) =>
    api<LeaderboardEntry[]>(`/leaderboard?${new URLSearchParams(query).toString()}`, { signal }),
};
