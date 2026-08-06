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

// Timing constants (production-grade)
const VISIBLE_MS = 3500; // Display banner for 3.5 seconds
const DEDUP_MS = 5000; // Deduplication window (prevent socket + push duplicate)
const MAX_QUEUE = 4; // Max queued notifications (prevent overflow)
const DISMISS_ANIMATION_MS = 200; // Smooth exit animation duration

const topInset = initialWindowMetrics?.insets?.top ?? 0;

function bannerKey(notification: any): string | null {
  if (!notification) return null;
  if (notification.id) return notification.id;
  const data = notification.data || {};
  return `${notification.type}:${data.bookingId || data.requestId || data.ticketId || ''}`;
}

export const NotificationBannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [queue, setQueue] = useState<any[]>([]);
  const [current, setCurrent] = useState<any | null>(null);

  const translateY = useSharedValue(-140);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const progressWidth = useSharedValue(100); // Progress bar: 100% → 0%

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recentKeys = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearCurrent = useCallback(() => {
    if (isMountedRef.current) {
      setCurrent(null);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    translateY.value = withTiming(-150, { duration: DISMISS_ANIMATION_MS });
    opacity.value = withTiming(0, { duration: DISMISS_ANIMATION_MS - 20 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
    progressWidth.value = 0;
  }, [clearTimers, clearCurrent, translateY, opacity, progressWidth]);

  // Slide the banner off to the left or right (swipe-to-dismiss).
  const dismissHorizontal = useCallback((dir: 1 | -1) => {
    clearTimers();
    translateX.value = withTiming(dir * 500, { duration: DISMISS_ANIMATION_MS });
    opacity.value = withTiming(0, { duration: DISMISS_ANIMATION_MS - 20 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
    progressWidth.value = 0;
  }, [clearTimers, clearCurrent, translateX, opacity, progressWidth]);

  const showBanner = useCallback((notification: any) => {
    // Never interrupt the user while they are already reading their inbox.
    if (useNotificationsStore.getState().suppressBanners) return;
    const key = bannerKey(notification);
    if (!key) return;
    
    // Coalesce near-duplicate banners (socket + push for the same event).
    if (recentKeys.current.has(key)) return;
    recentKeys.current.add(key);
    setTimeout(() => {
      recentKeys.current.delete(key);
    }, DEDUP_MS);

    // Add to queue (up to MAX_QUEUE to prevent memory bloat)
    setQueue((q) => (q.length >= MAX_QUEUE ? q : [...q, notification]));
  }, []);

  // Pull the next queued banner once the current one clears.
  useEffect(() => {
    if (current || queue.length === 0) return;
    
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);

    // Reset animations
    translateY.value = -150;
    translateX.value = 0;
    opacity.value = 0;
    progressWidth.value = 100;

    // Animate in
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 220 });

    // Haptic feedback (subtle)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}

    // Start auto-dismiss timer (3.5 seconds)
    dismissTimer.current = setTimeout(() => {
      if (isMountedRef.current) {
        dismiss();
      }
    }, VISIBLE_MS);

    // Animate progress bar disappearing
    progressTimer.current = setInterval(() => {
      progressWidth.value = withTiming(
        0,
        { duration: VISIBLE_MS },
        (finished) => {
          if (finished && progressTimer.current) {
            clearInterval(progressTimer.current);
            progressTimer.current = null;
          }
        }
      );
    }, 0);

    return () => {
      clearTimers();
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

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
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
            
            {/* Progress bar: indicates auto-dismiss timing */}
            <Animated.View
              style={[
                styles.progressBar,
                progressAnimatedStyle,
              ]}
            />
            
            {/* Queue indicator: shows if more notifications are waiting */}
            {queue.length > 0 && (
              <View style={styles.queueIndicator}>
                <Text style={styles.queueText}>{queue.length}</Text>
              </View>
            )}
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
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#FF5C00',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  queueIndicator: {
    position: 'absolute',
    top: -6,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF5C00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  queueText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
});
