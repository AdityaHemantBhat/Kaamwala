import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { authStorage } from '../utils/storage';
import { logger } from '../utils/logger';

interface User {
  id: string;
  phone: string;
  name: string;
  role: 'CUSTOMER' | 'WORKER' | 'ADMIN' | 'SUPER_ADMIN';
  isVerified: boolean;
  isBanned?: boolean;
  banReason?: string;
  banExpiresAt?: string;
  banType?: 'TEMPORARY' | 'PERMANENT';
  photoUrl?: string;
  email?: string;
  lastActiveAt?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;
  hasSelectedLanguage: boolean;

  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (state: boolean) => void;
  setHasSelectedLanguage: (state: boolean) => void;
  hydrateFromStorage: () => Promise<{ user: User | null; accessToken: string | null; refreshToken: string | null }>;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  _hasHydrated: false,
  hasSelectedLanguage: false,

  // Set authentication state and persist to appropriate storage
  setAuth: async (user, accessToken, refreshToken) => {
    try {
      const formattedUser = {
        ...user,
        photoUrl: (user as any).avatarUrl || user.photoUrl,
      };

      // Update Zustand state FIRST so API calls get the token immediately
      set({
        user: formattedUser,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isLoading: false
      });

      // Then persist to storage (fire-and-forget — don't block navigation)
      authStorage.setTokens(accessToken, refreshToken).catch(e =>
        logger.error('Error saving tokens to storage:', e)
      );
      authStorage.setUserProfile(formattedUser).catch(e =>
        logger.error('Error saving user profile to storage:', e)
      );
    } catch (error) {
      console.error('Error setting auth:', error);
      throw error;
    }
  },

  // Update user profile
  updateUser: async (updates) => {
    const { user } = get();
    if (!user) return;

    const updatedUser = { ...user, ...updates };

    try {
      // Update in AsyncStorage
      await authStorage.setUserProfile(updatedUser);

      // Update Zustand state
      set({ user: updatedUser });
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  // Logout - clear all auth data
  logout: async () => {
    try {
      // Clear storage
      await authStorage.clearAuth();

      // Clear Zustand state
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false
      });
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  },

  // Set loading state
  setLoading: (loading) => set({ isLoading: loading }),

  // Set hydration state
  setHasHydrated: (state) => set({ _hasHydrated: state }),

  // Set language selected state
  setHasSelectedLanguage: (state) => set({ hasSelectedLanguage: state }),

  // Hydrate from storage on app startup
  hydrateFromStorage: async () => {
    try {
      // Get tokens from SecureStore
      const { accessToken, refreshToken } = await authStorage.getTokens();

      // Get user profile from SecureStore
      const user = await authStorage.getUserProfile();

      // Update Zustand state
      set({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: !!accessToken,
        isLoading: false,
      });

      return { user, accessToken, refreshToken };
    } catch (error) {
      console.error('Error hydrating auth from storage:', error);
      set({ isLoading: false });
      return { user: null, accessToken: null, refreshToken: null };
    }
  },

  // Clear auth data (manual)
  clearAuth: async () => {
    try {
      await authStorage.clearAuth();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Error clearing auth:', error);
      throw error;
    }
  },
}));

// Initialize auth store on app startup
export const initializeAuth = async () => {
  const { setHasHydrated, setHasSelectedLanguage, hydrateFromStorage } = useAuthStore.getState();

  try {
    const hasLang = await import('../utils/i18n').then(m => m.hasSavedLanguage());
    setHasSelectedLanguage(hasLang);

    await hydrateFromStorage();
    setHasHydrated(true);
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    setHasHydrated(true); // Still set as hydrated to prevent infinite loading
  }
};

// Hook for checking if auth is initialized
export const useAuthInitialized = () => {
  return useAuthStore((state) => state._hasHydrated);
};

// Hook for checking authentication status
export const useIsAuthenticated = () => {
  return useAuthStore((state) => state.isAuthenticated);
};

// Hook for getting current user
export const useCurrentUser = () => {
  return useAuthStore((state) => state.user);
};

// Hook for getting tokens. useShallow keeps the selector from returning a fresh
// object reference every render, which would re-render consumers on every store
// change even when the tokens haven't moved.
export const useTokens = () => {
  return useAuthStore(useShallow((state) => ({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
  })));
};