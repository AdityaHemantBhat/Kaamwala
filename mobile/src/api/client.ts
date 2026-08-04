import axios from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/auth.store';
import { env } from '../config/env';

// Report the app version so the backend's requireMinVersion gate works.
export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

export const apiClient = axios.create({
  baseURL: env.API_URL || 'http://localhost:5000/api/v1',
  // Abort hung requests instead of leaving the UI spinning forever. 30s is
  // generous enough for image uploads yet bounds worst-case waits on flaky
  // networks. Screens surface the resulting error via their error states.
  timeout: 30000,
});

apiClient.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    config.headers['x-app-version'] = APP_VERSION;
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Parse backend error codes formatted as "CODE|Message"
    if (error.response?.data?.error && typeof error.response.data.error === 'string') {
      const errStr = error.response.data.error;
      if (errStr.includes('|')) {
        error.response.data.error = errStr.substring(errStr.indexOf('|') + 1);
      }
    }

    if (error.response?.status === 403 && error.response?.data?.banned) {
      const { user, updateUser } = useAuthStore.getState();
      if (user) {
        updateUser({
          isBanned: true,
          banReason: error.response.data.banned.reason,
          banExpiresAt: error.response.data.banned.expiresAt,
          banType: error.response.data.banned.type
        }).catch(() => {});
      }
      return Promise.reject(error);
    }

    // Transient network failure (no HTTP response): retry idempotent GETs once
    // after a short delay. Mutations are never auto-retried (double-submit risk).
    if (!error.response && originalRequest?.method?.toLowerCase() === 'get' && !originalRequest._networkRetry) {
      originalRequest._networkRetry = true;
      await new Promise((r) => setTimeout(r, 1200));
      return apiClient(originalRequest);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { refreshToken, setAuth, user } = useAuthStore.getState();
        
        if (!refreshToken || !user) {
          useAuthStore.getState().logout();
          return Promise.reject(error);
        }

        const response = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 },
        );

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;
        
        setAuth(user, newAccessToken, newRefreshToken);
        
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        // Only end the session when the refresh endpoint explicitly rejects the
        // token (401/403). Network errors and 5xx are transient — destroying a
        // user's session over a flaky connection is worse than the 401 itself.
        const status = refreshError?.response?.status;
        if (status === 401 || status === 403) {
          useAuthStore.getState().logout();
        }
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
