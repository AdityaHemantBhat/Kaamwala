import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useWorkerProfile(id?: string) {
  return useQuery({
    queryKey: ['worker', id ?? 'none'],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get(`/workers/${id}`, { signal });
      return res.data?.data;
    },
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 10 * 60 * 1000,
    // No placeholder: when navigating from one worker to another, the previous
    // worker's profile must never render while the new one loads. keepPreviousData
    // caused exactly that flash (old worker shown for ~1s on the new worker's screen).
    enabled: !!id,
    retry: 1,
  });
}
