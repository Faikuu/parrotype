import type { Language, QuoteLength } from '@/lib/engine/types';
import { api, apiBlob } from './client';
import type {
  AdminAuditEntry,
  AdminGroup,
  AdminGroupDetail,
  AdminQuote,
  AdminRace,
  AdminReport,
  AdminResult,
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  GroupMember,
  Paged,
  ExportFormat,
  FollowState,
  ReportInput,
  Insights,
  LeaderboardEntry,
  LeaderboardQuery,
  PublicProfile,
  PublicUser,
  Quote,
  Result,
  ResultInput,
  SortOrder,
  Summary,
  ReportStatus,
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

type Query = Record<string, string | number | boolean | undefined | null>;

/** A query string with the empty values left out. */
function query(params: Query): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

const adminPath = (rest: string) => `/admin${rest}`;
const json = (body: unknown) => ({ body });

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface UserListParams extends PageParams {
  q?: string;
  /** Sent as the string 'true' or 'false' (a boolean false would be dropped by the query builder). */
  banned?: 'true' | 'false';
  group?: number;
  sort?: 'created' | 'name' | 'results';
  order?: SortOrder;
}

export interface ResultListParams extends PageParams {
  user?: string;
  mode?: string;
  language?: string;
  suspicious?: boolean;
  sort?: 'created' | 'wpm';
  order?: SortOrder;
}

export interface QuoteListParams extends PageParams {
  language?: string;
  q?: string;
}

export interface AuditListParams extends PageParams {
  action?: string;
  admin?: string;
  target?: string;
}

export interface QuoteInput {
  language: string;
  text: string;
  source: string;
}

export const adminApi = {
  stats: (signal?: AbortSignal) => api<AdminStats>(adminPath('/stats'), { signal }),

  // Groups and permissions
  /** One page of groups (the groups list). */
  groups: (params: PageParams, signal?: AbortSignal) =>
    api<Paged<AdminGroup>>(adminPath(`/groups${query({ ...params })}`), { signal }),
  /** Every group, for the matrix, the user filter and the user's group list (the server caps a page at 100). */
  allGroups: async (signal?: AbortSignal): Promise<AdminGroup[]> =>
    (await api<Paged<AdminGroup>>(adminPath('/groups?pageSize=100'), { signal })).items,
  group: (id: number, signal?: AbortSignal) => api<AdminGroupDetail>(adminPath(`/groups/${id}`), { signal }),
  createGroup: (input: { name: string; description?: string; permissions?: string[] }) =>
    api<AdminGroup>(adminPath('/groups'), { method: 'POST', ...json(input) }),
  updateGroup: (id: number, input: { name?: string; description?: string }) =>
    api<AdminGroup>(adminPath(`/groups/${id}`), { method: 'PATCH', ...json(input) }),
  /** Replaces the group's permissions. The response says which implied read keys the server added. */
  setGroupPermissions: (id: number, permissions: string[]) =>
    api<AdminGroup & { impliedAdded: string[] }>(adminPath(`/groups/${id}/permissions`), {
      method: 'PUT',
      ...json({ permissions }),
    }),
  deleteGroup: (id: number) => api<{ ok: true }>(adminPath(`/groups/${id}`), { method: 'DELETE' }),
  addMember: (groupId: number, userId: number) =>
    api<GroupMember>(adminPath(`/groups/${groupId}/members/${userId}`), { method: 'PUT' }),
  removeMember: (groupId: number, userId: number) =>
    api<{ ok: true }>(adminPath(`/groups/${groupId}/members/${userId}`), { method: 'DELETE' }),

  // Users
  users: (params: UserListParams, signal?: AbortSignal) =>
    api<Paged<AdminUserRow>>(adminPath(`/users${query({ ...params })}`), { signal }),
  user: (id: number, signal?: AbortSignal) => api<AdminUserDetail>(adminPath(`/users/${id}`), { signal }),
  renameUser: (id: number, name: string) =>
    api<AdminUserRow>(adminPath(`/users/${id}`), { method: 'PATCH', ...json({ name }) }),
  revokeSessions: (id: number) => api<{ ok: true }>(adminPath(`/users/${id}/revoke-sessions`), { method: 'POST' }),
  ban: (id: number, reason: string) =>
    api<AdminUserRow>(adminPath(`/users/${id}/ban`), { method: 'POST', ...json({ reason }) }),
  unban: (id: number) => api<AdminUserRow>(adminPath(`/users/${id}/unban`), { method: 'POST' }),
  setUserGroups: (id: number, groupIds: number[]) =>
    api<AdminUserRow>(adminPath(`/users/${id}/groups`), { method: 'PUT', ...json({ groupIds }) }),
  deleteUser: (id: number, confirm: string) =>
    api<{ ok: true }>(adminPath(`/users/${id}`), { method: 'DELETE', ...json({ confirm }) }),

  // Results
  results: (params: ResultListParams, signal?: AbortSignal) =>
    api<Paged<AdminResult>>(adminPath(`/results${query({ ...params })}`), { signal }),
  deleteResult: (id: number) => api<{ ok: true }>(adminPath(`/results/${id}`), { method: 'DELETE' }),

  // Reports
  reports: (params: PageParams & { status: ReportStatus }, signal?: AbortSignal) =>
    api<Paged<AdminReport>>(adminPath(`/reports${query({ ...params })}`), { signal }),
  resolveReport: (id: number) => api<{ id: number; status: ReportStatus }>(adminPath(`/reports/${id}/resolve`), { method: 'POST' }),
  dismissReport: (id: number) => api<{ id: number; status: ReportStatus }>(adminPath(`/reports/${id}/dismiss`), { method: 'POST' }),

  // Quotes
  quotes: (params: QuoteListParams, signal?: AbortSignal) =>
    api<Paged<AdminQuote>>(adminPath(`/quotes${query({ ...params })}`), { signal }),
  createQuote: (input: QuoteInput) => api<AdminQuote>(adminPath('/quotes'), { method: 'POST', ...json(input) }),
  updateQuote: (id: number, input: Partial<QuoteInput>) =>
    api<AdminQuote>(adminPath(`/quotes/${id}`), { method: 'PATCH', ...json(input) }),
  deleteQuote: (id: number) => api<{ ok: true }>(adminPath(`/quotes/${id}`), { method: 'DELETE' }),

  // Races
  races: (signal?: AbortSignal) => api<AdminRace[]>(adminPath('/races'), { signal }),
  closeRace: (id: string) => api<{ ok: true }>(adminPath(`/races/${encodeURIComponent(id)}`), { method: 'DELETE' }),

  // Audit log
  actions: (params: AuditListParams, signal?: AbortSignal) =>
    api<Paged<AdminAuditEntry>>(adminPath(`/actions${query({ ...params })}`), { signal }),
};
