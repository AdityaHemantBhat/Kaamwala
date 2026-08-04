import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/ToastProvider';
import { NotificationBannerProvider } from '../components/ui/NotificationBannerProvider';
import { initI18n } from '../utils/i18n';
import { useAuthStore, initializeAuth } from '../store/auth.store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts, Poppins_800ExtraBold, Poppins_700Bold, Poppins_600SemiBold, Poppins_500Medium } from '@expo-google-fonts/poppins';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { registerForPushNotifications, setupNotificationListeners } from '../utils/notifications';
import { BrandLaunchScreen } from '../components/ui/BrandLaunchScreen';

const queryClient = new QueryClient();

// Keep the native splash up until fonts + auth are ready so there is never a
// blank or unstyled frame. The branded launch screen takes over once ready.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { _hasHydrated, isAuthenticated } = useAuthStore();
  const [launchDone, setLaunchDone] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_800ExtraBold,
    Poppins_700Bold,
    Poppins_600SemiBold,
    Poppins_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // Initialize auth storage + i18n on startup
  useEffect(() => {
    const init = async () => {
      await initializeAuth();
    };
    init();
    initI18n();
  }, []);

  // Register the push token only once a user is authenticated — registering at
  // startup (pre-login) caused an unauthenticated 401 that could even trigger
  // the client's logout-on-401 path.
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications();
    }
  }, [isAuthenticated]);

  const ready = fontsLoaded && _hasHydrated;

  // Hand off from the native splash to the branded launch screen only once
  // fonts + auth are ready.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Setup notification listeners
  useEffect(() => {
    return setupNotificationListeners();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <NotificationBannerProvider>
            <BottomSheetModalProvider>
              <View style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }} />
                {ready && !launchDone && (
                  <BrandLaunchScreen onFinish={() => setLaunchDone(true)} />
                )}
              </View>
            </BottomSheetModalProvider>
          </NotificationBannerProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
