import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, authApi } from '@/lib/api';
import type { PublicUser } from '@/lib/api/types';

export const ME_QUERY_KEY = ['me'] as const;

/**
 * What the password step of a login produced. With two-factor sign-in on there is no session yet:
 * the caller shows the code step and passes the ticket to verify2fa.
 */
export type LoginOutcome =
  | { twoFactorRequired: false; user: PublicUser }
  | { twoFactorRequired: true; ticket: string };

/** Cached queries that hold one user's data. Dropped whenever the signed-in user changes. */
const USER_SCOPED_QUERY_KEYS = [['results'], ['summary'], ['insights']] as const;

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
    mutationFn: async (input: { email: string; password: string }): Promise<LoginOutcome> => {
      const res = await authApi.login(input);
      if ('user' in res) return { twoFactorRequired: false, user: res.user };
      return { twoFactorRequired: true, ticket: res.ticket };
    },
    onSuccess: (outcome) => {
      if (outcome.twoFactorRequired) return;
      clearUserScopedQueries(qc);
      qc.setQueryData(ME_QUERY_KEY, outcome.user);
    },
  });

  /** The second login step. On success the session cookie is set and the user is signed in. */
  const verify2fa = useMutation({
    mutationFn: (input: { ticket: string; code: string }) => authApi.verifyTwoFactor(input),
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
    verify2fa: (input: { ticket: string; code: string }) => verify2fa.mutateAsync(input),
    register: register.mutateAsync,
    logout: logout.mutateAsync,
  };
}
