import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useToast } from '../components/ui/ToastProvider';
import { t } from '../utils/i18n';
import { router } from 'expo-router';

export const useCreateBooking = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (bookingData: any) => {
      const { data } = await apiClient.post('/bookings', bookingData);
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      showToast({ message: t('Booking created successfully!'), type: 'success' });
      // Redirect to the booking tracking screen
      router.push(`/(customer)/booking/${data.id}` as any);
    },
    onError: (error: any) => {
      showToast({ message: error.response?.data?.message || t('Failed to create booking'), type: 'error' });
    }
  });
};
