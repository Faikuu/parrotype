import { useQuery } from '@tanstack/react-query';
import { resultsApi } from '@/lib/api';

/** The signed-in user's insights. Shared by the account page's sections, under one key. */
export function useInsights(enabled = true) {
  return useQuery({
    queryKey: ['insights'],
    queryFn: ({ signal }) => resultsApi.insights(signal),
    enabled,
  });
}
