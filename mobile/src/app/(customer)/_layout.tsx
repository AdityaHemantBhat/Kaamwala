import React, { useEffect, useRef } from 'react';
import { StyleSheet, Platform, AppState } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { socketService } from '../../api/socket';
import { useT } from '../../utils/i18n';
import { useNotificationBanner } from '../../components/ui/NotificationBannerProvider';

export default function CustomerLayout() {
  const t = useT();
  const { showBanner } = useNotificationBanner();
  const { user } = useAuthStore();
  const appState = useRef(AppState.currentState);

  // Global socket connection for real-time notifications
  useEffect(() => {
    socketService.connect();

    const handler = (notif: any) => {
      showBanner(notif);
      useNotificationsStore.getState().bumpUnread();
    };
    socketService.on('new_notification', handler);

    // Reconnect when app comes to foreground
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        socketService.connect();
      }
      appState.current = nextState;
    });

    return () => {
      socketService.off('new_notification', handler);
      sub.remove();
    };
  }, []);

  if (user?.isBanned) {
    return <Redirect href="/(banned)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF5C00',
        tabBarInactiveTintColor: '#999999',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('Home'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('Bookings'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Search is a sub-screen, hide from Tab Bar */}
      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="rebook"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="worker/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="addresses"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="referrals"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="post-request"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="live-tracking"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="urgent"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="guarantee"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="disputes/create"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    height: Platform.OS === 'ios' ? 100 : 80,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  tabBarLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
});