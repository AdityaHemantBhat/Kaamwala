import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

interface SearchWorkersParams {
  lat: number;
  lng: number;
  category?: string;
  minRating?: number;
  maxPrice?: number;
  radius?: number;
  page?: number;
  limit?: number;
}

export const useWorkers = (params: SearchWorkersParams, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['workers', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/workers/search', { params });
      return data.data; // Assuming response is { success: true, data: [...] }
    },
    enabled,
  });
};
