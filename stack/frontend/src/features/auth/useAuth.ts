import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, authApi } from '@/lib/api';
import type { PublicUser } from '@/lib/api/types';

export const ME_QUERY_KEY = ['me'] as const;

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

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) => authApi.login(input),
    onSuccess: ({ user }) => qc.setQueryData(ME_QUERY_KEY, user),
  });

  const register = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      authApi.register(input),
    onSuccess: ({ user }) => qc.setQueryData(ME_QUERY_KEY, user),
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.setQueryData(ME_QUERY_KEY, null);
      void qc.removeQueries({ queryKey: ['results'] });
      void qc.removeQueries({ queryKey: ['summary'] });
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
