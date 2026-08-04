import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { notificationBus } from '../../utils/notificationBus';
import { getNotificationMeta, resolveNotificationRoute } from '../../utils/notificationMeta';

interface BannerContextValue {
  showBanner: (notification: any) => void;
}

const BannerContext = createContext<BannerContextValue | undefined>(undefined);

export const useNotificationBanner = () => {
  const ctx = useContext(BannerContext);
  if (!ctx) throw new Error('useNotificationBanner must be used within NotificationBannerProvider');
  return ctx;
};

const VISIBLE_MS = 4200;
const DEDUP_MS = 3000;
const MAX_QUEUE = 4;

function bannerKey(notification: any): string | null {
  if (!notification) return null;
  if (notification.id) return notification.id;
  const data = notification.data || {};
  return `${notification.type}:${data.bookingId || data.requestId || data.ticketId || ''}`;
}

const topInset = initialWindowMetrics?.insets?.top ?? 0;

export const NotificationBannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [queue, setQueue] = useState<any[]>([]);
  const [current, setCurrent] = useState<any | null>(null);

  const translateY = useSharedValue(-140);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentKeys = useRef<Set<string>>(new Set());

  const clearCurrent = useCallback(() => setCurrent(null), []);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateY.value = withTiming(-150, { duration: 200 });
    opacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
  }, [translateY, opacity, clearCurrent]);

  // Slide the banner off to the left or right (swipe-to-dismiss).
  const dismissHorizontal = useCallback((dir: 1 | -1) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateX.value = withTiming(dir * 500, { duration: 200 });
    opacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
  }, [translateX, opacity, clearCurrent]);

  const showBanner = useCallback((notification: any) => {
    // Never interrupt the user while they are already reading their inbox.
    if (useNotificationsStore.getState().suppressBanners) return;
    const key = bannerKey(notification);
    if (!key) return;
    // Coalesce near-duplicate banners (socket + push for the same event).
    if (recentKeys.current.has(key)) return;
    recentKeys.current.add(key);
    setTimeout(() => recentKeys.current.delete(key), DEDUP_MS);
    setQueue((q) => (q.length >= MAX_QUEUE ? q : [...q, notification]));
  }, []);

  // Pull the next queued banner once the current one clears.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);

    translateY.value = -150;
    translateX.value = 0;
    opacity.value = 0;
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 220 });

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}

    dismissTimer.current = setTimeout(dismiss, VISIBLE_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, queue.length]);

  // Bridge foreground push notifications into the same banner.
  useEffect(() => {
    return notificationBus.subscribe((notification) => showBanner(notification));
  }, [showBanner]);

  const handlePress = useCallback(() => {
    if (!current) return;
    const route = resolveNotificationRoute(current, user?.role as any);
    if (route) {
      router.push(route as never);
    }
    dismiss();
  }, [current, user, router, dismiss]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Horizontal swipe (left/right) or vertical drag (up) — only the dominant axis moves.
      if (Math.abs(e.translationX) > Math.abs(e.translationY)) {
        translateY.value = 0;
        translateX.value = e.translationX;
      } else {
        translateX.value = 0;
        translateY.value = Math.min(0, e.translationY);
      }
    })
    .onEnd((e) => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      if (horizontal && (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 500)) {
        // Swipe left/right to dismiss, sliding off in that direction.
        runOnJS(dismissHorizontal)(e.translationX > 0 ? 1 : -1);
      } else if (!horizontal && (e.translationY < -36 || e.velocityY < -400)) {
        runOnJS(dismiss)();
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <BannerContext.Provider value={{ showBanner }}>
      {children}
      {current && (
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.container,
              { top: topInset + 8, zIndex: 10000 },
              animatedStyle,
            ]}
          >
            <Pressable onPress={handlePress} style={styles.inner} accessibilityRole="button">
              {(() => {
                const meta = getNotificationMeta(current.type);
                return (
                  <>
                    <View style={[styles.iconWrap, { backgroundColor: meta.color + '16' }]}>
                      <MaterialCommunityIcons name={meta.icon as any} size={22} color={meta.color} />
                    </View>
                    <View style={styles.textWrap}>
                      <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
                      <Text style={styles.body} numberOfLines={2}>{current.body}</Text>
                    </View>
                    <View style={styles.chevronWrap}>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#C8C0B0" />
                    </View>
                  </>
                );
              })()}
            </Pressable>
          </Animated.View>
        </GestureDetector>
      )}
    </BannerContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13,13,13,0.06)',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#0D0D0D',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: '#6B6B6B',
    marginTop: 2,
    lineHeight: 17,
  },
  chevronWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
});
