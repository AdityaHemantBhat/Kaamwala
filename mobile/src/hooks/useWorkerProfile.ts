import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useWorkerProfile(id: string) {
  return useQuery({
    queryKey: ['worker', id],
    queryFn: async ({ signal }) => {
      const res = await apiClient.get(`/workers/${id}`, { signal });
      return res.data?.data;
    },
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 10 * 60 * 1000,
    keepPreviousData: true,        // Prevents flash & image disappearance on navigation
    enabled: !!id,
    retry: 1,
  });
}