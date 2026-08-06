import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Timing constants
const VISIBLE_MS = 3500; // Display banner for 3.5 seconds
const DEDUP_MS = 5000; // Deduplication window (prevent socket + push duplicate)
const MAX_QUEUE = 4; // Max queued notifications
const DISMISS_ANIMATION_MS = 200; // Exit animation duration
const ENTRY_DURATION_MS = 260; // Entry animation duration
// Safety net: if the exit animation callback is ever cancelled (a second dismiss
// path races the first), force-clear the banner so the queue never stalls.
const CLEAR_FALLBACK_MS = DISMISS_ANIMATION_MS + 150;

interface PendingNotification {
  notification: any;
  key: string;
}

/**
 * Build a stable dedup key for a notification payload. The raw id is preferred;
 * otherwise fall back to the event's identity fields (type + linked entity) plus
 * a content fingerprint so two distinct notifications of the same type with no
 * ids don't collapse into one key and get dropped.
 */
function bannerKey(notification: any): string | null {
  if (!notification) return null;
  if (notification.id) return notification.id;
  const data = notification.data || {};
  const entity = data.bookingId || data.requestId || data.ticketId || data.submissionId || '';
  const title = String(notification.title || '');
  const body = String(notification.body || '');
  const contentFingerprint = `${title.length}:${body.length}:${title.slice(0, 24)}:${body.slice(0, 24)}`;
  return `${notification.type || 'notif'}:${entity}:${contentFingerprint}`;
}

export const NotificationBannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [queue, setQueue] = useState<PendingNotification[]>([]);
  const [current, setCurrent] = useState<any | null>(null);

  const translateY = useSharedValue(-140);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const progressWidth = useSharedValue(100); // Progress bar: 100% → 0%

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dedupTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const recentKeys = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Clear every pending timer on unmount (dedup timeouts included).
      dedupTimers.current.forEach((id) => clearTimeout(id));
      dedupTimers.current.clear();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (clearFallbackTimer.current) clearTimeout(clearFallbackTimer.current);
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
    if (clearFallbackTimer.current) {
      clearTimeout(clearFallbackTimer.current);
      clearFallbackTimer.current = null;
    }
  }, []);

  // Single exit path: animate out, then hard-clear the banner. The fallback
  // timer guarantees the queue advances even if the exit animation callback is
  // cancelled by a racing dismiss.
  const dismiss = useCallback(() => {
    clearTimers();
    translateY.value = withTiming(-150, { duration: DISMISS_ANIMATION_MS });
    opacity.value = withTiming(0, { duration: DISMISS_ANIMATION_MS - 20 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
    progressWidth.value = 0;
    clearFallbackTimer.current = setTimeout(() => {
      clearFallbackTimer.current = null;
      if (isMountedRef.current) clearCurrent();
    }, CLEAR_FALLBACK_MS);
  }, [clearTimers, clearCurrent, translateY, opacity, progressWidth]);

  // Slide the banner off to the left or right (swipe-to-dismiss).
  const dismissHorizontal = useCallback((dir: 1 | -1) => {
    clearTimers();
    translateX.value = withTiming(dir * 500, { duration: DISMISS_ANIMATION_MS });
    opacity.value = withTiming(0, { duration: DISMISS_ANIMATION_MS - 20 }, (finished) => {
      if (finished) runOnJS(clearCurrent)();
    });
    progressWidth.value = 0;
    clearFallbackTimer.current = setTimeout(() => {
      clearFallbackTimer.current = null;
      if (isMountedRef.current) clearCurrent();
    }, CLEAR_FALLBACK_MS);
  }, [clearTimers, clearCurrent, translateX, opacity, progressWidth]);

  const showBanner = useCallback((notification: any) => {
    // Never interrupt the user while they are already reading their inbox.
    if (useNotificationsStore.getState().suppressBanners) return;
    const key = bannerKey(notification);
    if (!key) return;

    // Coalesce near-duplicate banners (socket + push for the same event).
    if (recentKeys.current.has(key)) return;
    recentKeys.current.add(key);
    const dedupTimer = setTimeout(() => {
      recentKeys.current.delete(key);
      dedupTimers.current.delete(dedupTimer);
    }, DEDUP_MS);
    dedupTimers.current.add(dedupTimer);

    // Drop the oldest queued banner when full so the newest is never silently
    // lost (bounded memory + latest-first UX).
    setQueue((q) => {
      const next: PendingNotification[] = [...q, { notification, key }];
      return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
    });
  }, []);

  // Pull the next queued banner once the current one clears.
  useEffect(() => {
    if (current || queue.length === 0) return;

    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next.notification);

    // Reset animations
    translateY.value = -150;
    translateX.value = 0;
    opacity.value = 0;
    progressWidth.value = 100;

    // Animate in (slide down + fade)
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: ENTRY_DURATION_MS });

    // Haptic feedback (subtle)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}

    // Auto-dismiss after the display window.
    dismissTimer.current = setTimeout(() => {
      if (isMountedRef.current) {
        dismiss();
      }
    }, VISIBLE_MS);

    // Single continuous progress animation (100% → 0%). A lone withTiming,
    // not an interval restarting it every frame — the previous version never
    // actually drained and leaked an interval.
    progressTimer.current = setInterval(() => {
      progressWidth.value = withTiming(0, { duration: VISIBLE_MS });
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
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

  const meta = current ? getNotificationMeta(current.type) : null;

  return (
    <BannerContext.Provider value={{ showBanner }}>
      {children}
      {current && meta && (
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.container,
              { top: insets.top + 8, zIndex: 10000 },
              animatedStyle,
            ]}
          >
            <Pressable onPress={handlePress} style={styles.inner} accessibilityRole="button">
              {/* Slim progress accent at the top — subtle countdown, not an
                  orange bottom border. Tinted by the notification type. */}
              <Animated.View
                style={[styles.progressBar, { backgroundColor: meta.color }, progressAnimatedStyle]}
              />
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
            </Pressable>

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
    overflow: 'hidden',
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
    top: 0,
    left: 0,
    height: 3,
    borderTopLeftRadius: 16,
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
