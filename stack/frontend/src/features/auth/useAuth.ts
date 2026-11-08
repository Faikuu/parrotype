import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, authApi } from '@/lib/api';
import type { PublicUser } from '@/lib/api/types';

export const ME_QUERY_KEY = ['me'] as const;

/** Cached queries that hold one user's data. Dropped whenever the signed-in user changes. */
const USER_SCOPED_QUERY_KEYS = [['results'], ['summary']] as const;

function clearUserScopedQueries(qc: QueryClient): void {
  for (const queryKey of USER_SCOPED_QUERY_KEYS) void qc.removeQueries({ queryKey });
}

async function fetchMe(signal?: AbortSignal): Promise<PublicUser | null> {
  try {
    return (await authApi.me(signal)).user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function useAuth() {
  const qc = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 401) && failureCount < 1,
  });

  // Signed out (the session check resolved to null): nothing user-specific may stay cached.
  const signedOut = meQuery.isSuccess && meQuery.data === null;
  useEffect(() => {
    if (signedOut) clearUserScopedQueries(qc);
  }, [signedOut, qc]);

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) => authApi.login(input),
    onSuccess: ({ user }) => {
      clearUserScopedQueries(qc);
      qc.setQueryData(ME_QUERY_KEY, user);
    },
  });

  const register = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      authApi.register(input),
    onSuccess: ({ user }) => {
      clearUserScopedQueries(qc);
      qc.setQueryData(ME_QUERY_KEY, user);
    },
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.setQueryData(ME_QUERY_KEY, null);
      clearUserScopedQueries(qc);
    },
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    login: login.mutateAsync,
    register: register.mutateAsync,
    logout: logout.mutateAsync,
  };
}
