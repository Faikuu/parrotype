import type { Language, QuoteLength } from '@/lib/engine/types';
import { api, apiBlob } from './client';
import type {
  AdminAuditEntry,
  AdminDecision,
  AdminReport,
  AdminUserState,
  ExportFormat,
  FollowState,
  ReportInput,
  ReportStatus,
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
  get: (query: LeaderboardQuery, signal?: AbortSignal) => {
    // `scope` is only sent when it is set, so the default request is unchanged.
    const params: Record<string, string> = { mode: query.mode, mode2: query.mode2, language: query.language };
    if (query.scope) params.scope = query.scope;
    return api<LeaderboardEntry[]>(`/leaderboard?${new URLSearchParams(params).toString()}`, { signal });
  },
};

const userPath = (name: string) => `/users/${encodeURIComponent(name)}`;

export const usersApi = {
  profile: (name: string, signal?: AbortSignal) => api<PublicProfile>(userPath(name), { signal }),
  follow: (name: string) => api<FollowState>(`${userPath(name)}/follow`, { method: 'PUT' }),
  unfollow: (name: string) => api<FollowState>(`${userPath(name)}/follow`, { method: 'DELETE' }),
  report: (name: string, input: ReportInput) =>
    api<{ ok: true }>(`${userPath(name)}/report`, { method: 'POST', body: input }),
};

const adminPath = (rest: string) => `/admin${rest}`;

export const adminApi = {
  reports: (status: ReportStatus, signal?: AbortSignal) =>
    api<AdminReport[]>(adminPath(`/reports?status=${status}`), { signal }),
  resolveReport: (id: number) => api<AdminDecision>(adminPath(`/reports/${id}/resolve`), { method: 'POST' }),
  dismissReport: (id: number) => api<AdminDecision>(adminPath(`/reports/${id}/dismiss`), { method: 'POST' }),
  ban: (name: string, reason: string) =>
    api<AdminUserState>(adminPath(`/users/${encodeURIComponent(name)}/ban`), { method: 'POST', body: { reason } }),
  unban: (name: string) =>
    api<AdminUserState>(adminPath(`/users/${encodeURIComponent(name)}/unban`), { method: 'POST' }),
  deleteResult: (id: number) => api<{ ok: true }>(adminPath(`/results/${id}`), { method: 'DELETE' }),
  actions: (signal?: AbortSignal) => api<AdminAuditEntry[]>(adminPath('/actions'), { signal }),
};
