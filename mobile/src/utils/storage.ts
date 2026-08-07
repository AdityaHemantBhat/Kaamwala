import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage Utility for handling secure and non-secure storage
 *
 * SecureStore has a 2048-byte limit, so we use it only for:
 * - Access tokens
 * - Refresh tokens
 * - Other sensitive keys
 *
 * AsyncStorage is used for:
 * - User profiles
 * - App settings
 * - Large data objects
 */

// Secure keys - store only critical data here
const SECURE_KEYS = {
  ACCESS_TOKEN: 'access-token',
  REFRESH_TOKEN: 'refresh-token',
  DEVICE_ID: 'device-id',
} as const;

// AsyncStorage keys - for larger, non-sensitive data
const ASYNC_KEYS = {
  USER_PROFILE: 'user-profile',
  APP_SETTINGS: 'app-settings',
  CACHE_DATA: 'cache-data',
  CHAT_HISTORY: 'chat-history',
} as const;

/**
 * Secure Storage - for sensitive data under 2048 bytes
 */
export const secureStorage = {
  // Store sensitive string data
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Validate size before storing (estimate ~2 chars per byte)
      if (value.length > 1000) {
        console.warn(`SecureStore warning: Value for key "${key}" is ${value.length} chars, may exceed 2048-byte limit`);
      }
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`SecureStore setItem error for key "${key}":`, error);
      throw error;
    }
  },

  // Get sensitive string data
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`SecureStore getItem error for key "${key}":`, error);
      return null;
    }
  },

  // Remove sensitive data
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`SecureStore removeItem error for key "${key}":`, error);
    }
  },

  // Store sensitive object (JSON stringify)
  setObject: async (key: string, value: any): Promise<void> => {
    const jsonString = JSON.stringify(value);
    // Validate size
    if (jsonString.length > 1000) {
      console.warn(`SecureStore object warning: JSON for key "${key}" is ${jsonString.length} chars`);
    }
    return secureStorage.setItem(key, jsonString);
  },

  // Get sensitive object (JSON parse)
  getObject: async <T>(key: string): Promise<T | null> => {
    const data = await secureStorage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`SecureStore getObject parse error for key "${key}":`, error);
      return null;
    }
  },
};

/**
 * App Storage - hybrid storage with automatic data separation
 */
export const appStorage = {
 /**
 * Store data with automatic storage selection
 * Sensitive data goes to SecureStore, large data to AsyncStorage
 */
  setItem: async (key: string, value: any, options?: { secure?: boolean }): Promise<void> => {
    const useSecure = options?.secure ?? false;
    const jsonString = JSON.stringify(value);

    // Auto-detect if we should use secure storage
    const shouldUseSecure = useSecure || jsonString.length <= 500; // Small enough for SecureStore

    if (shouldUseSecure) {
      return secureStorage.setItem(key, jsonString);
    } else {
      // Use AsyncStorage for larger data
      try {
        await AsyncStorage.setItem(key, jsonString);
      } catch (error) {
        console.error(`AsyncStorage setItem error for key "${key}":`, error);
        throw error;
      }
    }
  },

 /**
 * Get data from appropriate storage
 */
  getItem: async <T>(key: string): Promise<T | null> => {
    // Try SecureStore first
    const secureData = await secureStorage.getItem(key);
    if (secureData !== null) {
      try {
        return JSON.parse(secureData) as T;
      } catch {
        // Not JSON or parse error, return as string
        return secureData as any;
      }
    }

    // Try AsyncStorage
    try {
      const asyncData = await AsyncStorage.getItem(key);
      if (asyncData !== null) {
        return JSON.parse(asyncData) as T;
      }
    } catch (error) {
      console.error(`AsyncStorage getItem error for key "${key}":`, error);
    }

    return null;
  },

 /**
 * Remove data from both storages
 */
  removeItem: async (key: string): Promise<void> => {
    await Promise.all([
      secureStorage.removeItem(key),
      AsyncStorage.removeItem(key),
    ]);
  },

 /**
 * Clear all storage
 */
  clearAll: async (): Promise<void> => {
    await Promise.all([
      // Clear SecureStore keys
      ...Object.values(SECURE_KEYS).map(key => secureStorage.removeItem(key)),
      // Clear AsyncStorage
      AsyncStorage.clear(),
    ]);
  },

 /**
 * Migrate data from SecureStore to AsyncStorage if too large
 */
  migrateIfLarge: async (key: string, threshold: number = 500): Promise<void> => {
    const data = await secureStorage.getItem(key);
    if (data && data.length > threshold) {
      await AsyncStorage.setItem(key, data);
      await secureStorage.removeItem(key);
    }
  },
};

/**
 * Auth-specific storage helpers
 */
export const authStorage = {
  // Store tokens in SecureStore (sensitive, small data)
  setTokens: async (accessToken: string, refreshToken: string): Promise<void> => {
    await Promise.all([
      secureStorage.setItem(SECURE_KEYS.ACCESS_TOKEN, accessToken),
      secureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  },

  // Get tokens from SecureStore
  getTokens: async (): Promise<{ accessToken: string | null; refreshToken: string | null }> => {
    const [accessToken, refreshToken] = await Promise.all([
      secureStorage.getItem(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.getItem(SECURE_KEYS.REFRESH_TOKEN),
    ]);
    return { accessToken, refreshToken };
  },

  // Clear auth tokens
  clearTokens: async (): Promise<void> => {
    await Promise.all([
      secureStorage.removeItem(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.removeItem(SECURE_KEYS.REFRESH_TOKEN),
    ]);
  },

  // Store user profile in SecureStore (small JSON, well under 2048-byte limit)
  setUserProfile: async (user: any): Promise<void> => {
    // Store minimal user data for quick access
    const minimalUser = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      isVerified: user.isVerified,
      photoUrl: user.avatarUrl || user.photoUrl,
    };
    await secureStorage.setItem(ASYNC_KEYS.USER_PROFILE, JSON.stringify(minimalUser));
  },

  // Get user profile from SecureStore
  getUserProfile: async (): Promise<any | null> => {
    const data = await secureStorage.getItem(ASYNC_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  },

  // Clear user profile
  clearUserProfile: async (): Promise<void> => {
    await secureStorage.removeItem(ASYNC_KEYS.USER_PROFILE);
  },

  // Complete auth clear
  clearAuth: async (): Promise<void> => {
    await Promise.all([
      authStorage.clearTokens(),
      authStorage.clearUserProfile(),
    ]);
  },

  // Check if user is authenticated
  isAuthenticated: async (): Promise<boolean> => {
    const { accessToken } = await authStorage.getTokens();
    return !!accessToken;
  },
};

/**
 * Cache storage helpers for API responses, etc.
 */
export const cacheStorage = {
  set: async (key: string, data: any, ttl?: number): Promise<void> => {
    const cacheData = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    await AsyncStorage.setItem(`${ASYNC_KEYS.CACHE_DATA}:${key}`, JSON.stringify(cacheData));
  },

  get: async <T>(key: string): Promise<T | null> => {
    const cached = await AsyncStorage.getItem(`${ASYNC_KEYS.CACHE_DATA}:${key}`);
    if (!cached) return null;

    const { data, timestamp, ttl } = JSON.parse(cached);

    // Check if cache is expired
    if (ttl && Date.now() - timestamp > ttl * 1000) {
      await AsyncStorage.removeItem(`${ASYNC_KEYS.CACHE_DATA}:${key}`);
      return null;
    }

    return data as T;
  },

  remove: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(`${ASYNC_KEYS.CACHE_DATA}:${key}`);
  },

  clearExpired: async (): Promise<void> => {
    // Implementation for clearing expired cache
    // This would need to iterate through all cache keys
  },
};

// Export constants for use in other files
export { SECURE_KEYS, ASYNC_KEYS };