import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import type { VerifyOtpPayload } from '../api/auth.api';

export const useSendOtp = () => {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { data } = await apiClient.post('/auth/send-otp', { phone });
      return data;
    },
  });
};

export const useVerifyOtp = () => {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async ({ phone, otp, role, fcmToken, deviceInfo }: VerifyOtpPayload) => {
      const { data } = await apiClient.post('/auth/verify-otp', { phone, otp, role, fcmToken, deviceInfo });
      return data.data; // Assuming response is { success: true, data: { user, accessToken, refreshToken } }
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
    },
  });
};
