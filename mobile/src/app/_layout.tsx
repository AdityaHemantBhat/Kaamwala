import { useEffect, useState } from 'react';
import { View, Text, useColorScheme, type TextStyle } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/ToastProvider';
import { NotificationBannerProvider } from '../components/ui/NotificationBannerProvider';
import { BroadcastPopupProvider } from '../components/ui/BroadcastPopup';
import { initI18n, useT } from '../utils/i18n';
import { useAuthStore, initializeAuth } from '../store/auth.store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider, KeyboardToolbar } from 'react-native-keyboard-controller';
import { useFonts, Poppins_800ExtraBold, Poppins_700Bold, Poppins_600SemiBold, Poppins_500Medium } from '@expo-google-fonts/poppins';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { registerForPushNotifications, setupNotificationListeners } from '../utils/notifications';
import { BrandLaunchScreen } from '../components/ui/BrandLaunchScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The app renders cached data instantly and refetches in the background —
      // avoids the loading-skeleton flash on every navigation while keeping
      // data fresh for high-traffic screens.
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Global prev/next/done toolbar that renders above the keyboard on every
// screen (labels localized via useT). Prev/Next jump between focusable inputs;
// Done dismisses the keyboard. Rendered only while the keyboard is up.
//
// Note: the library renders Prev/Next children directly inside the native
// button view (no <Text> wrapper), so the label MUST be wrapped in <Text> —
// a bare string child throws "Text strings must be rendered within a <Text>
// component" on Android. Done is safe because it renders its label inside
// <Text> itself.
function AppKeyboardToolbar() {
  const t = useT();
  const scheme = useColorScheme();
  // Mirror the library's own theme (light/dark) so the labels match the
  // Done button next to them regardless of the system color scheme.
  const labelStyle: TextStyle = {
    color: scheme === 'dark' ? '#fafafa' : '#2c2c2c',
    fontWeight: '600',
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
  };
  return (
    <KeyboardToolbar>
      <KeyboardToolbar.Prev>
        <Text style={labelStyle}>{t('Previous')}</Text>
      </KeyboardToolbar.Prev>
      <KeyboardToolbar.Next>
        <Text style={labelStyle}>{t('Next')}</Text>
      </KeyboardToolbar.Next>
      <KeyboardToolbar.Done text={t('Done')} />
    </KeyboardToolbar>
  );
}

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

  // Register push token on app launch (once authenticated)
  // Re-registration is handled automatically in setupNotificationListeners() on foreground
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
            <BroadcastPopupProvider>
            <BottomSheetModalProvider>
              <KeyboardProvider>
                <View style={{ flex: 1 }}>
                  <Stack screenOptions={{ headerShown: false }} />
                  {/* Prev/Next/Done toolbar above the keyboard (Android + iOS) */}
                  <AppKeyboardToolbar />
                  {ready && !launchDone && (
                    <BrandLaunchScreen onFinish={() => setLaunchDone(true)} />
                  )}
                </View>
              </KeyboardProvider>
            </BottomSheetModalProvider>
            </BroadcastPopupProvider>
          </NotificationBannerProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
