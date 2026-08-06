import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Animated, AppState, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useAuthStore } from '../../store/auth.store';
import { useT } from '../../utils/i18n';

interface Broadcast {
  id: string;
  title: string;
  body: string;
  targetRole: 'ALL' | 'WORKER' | 'CUSTOMER' | 'ADMIN';
  expiresAt: number;
}

const SEEN_KEY = 'kaamwala_seen_broadcasts';
const MAX_QUEUE = 5; // Never accumulate unbounded broadcast popups.

/** True when the current user is part of the broadcast's audience. Shared by
 *  the polled popup and the realtime event so the two paths agree. */
function isTargeted(broadcast: Broadcast, userRole?: string): boolean {
  return broadcast.targetRole === 'ALL' || broadcast.targetRole === userRole;
}

/** Normalize the poll response and the socket payload into one shape. The id
 *  (added server-side) is the single source of truth for one-time dedup. */
function normalize(raw: any): Broadcast | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.timestamp ?? raw.createdAt;
  const title = raw.title;
  const body = raw.body;
  if (!id || !title || !body) return null;
  const created = raw.timestamp ?? raw.createdAt ?? Date.now();
  const expiresAt = raw.expiresAt ?? created + (raw.expiresInHours ?? 24) * 60 * 60 * 1000;
  return { id: String(id), title, body, targetRole: raw.targetRole ?? 'ALL', expiresAt };
}

async function loadSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function persistSeenIds(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort — a failed write only risks showing a popup twice.
  }
}

export const BroadcastPopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [queue, setQueue] = useState<Broadcast[]>([]);
  const [current, setCurrent] = useState<Broadcast | null>(null);

  // seenRef = ids the user has already dismissed (persisted — never re-shown).
  // inFlightRef = ids currently queued/displayed but not yet dismissed, so a
  // socket event + the active-broadcast poll for the same broadcast can't
  // double-enqueue before the user closes it.
  const seenRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());

  // Popup entrance animation (fade + gentle scale, like a dialog).
  const overlayOp = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    loadSeenIds().then((ids) => {
      seenRef.current = ids;
    });
  }, []);

  useEffect(() => {
    if (current) {
      Animated.parallel([
        Animated.timing(overlayOp, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, damping: 18, stiffness: 260, useNativeDriver: true }),
      ]).start();
    } else {
      overlayOp.setValue(0);
      cardScale.setValue(0.92);
    }
  }, [current, overlayOp, cardScale]);

  const tryShow = useCallback((raw: any) => {
    const bc = normalize(raw);
    if (!bc) return;
    if (bc.expiresAt && bc.expiresAt < Date.now()) return;
    if (!isTargeted(bc, user?.role)) return;
    if (seenRef.current.has(bc.id)) return; // already seen once — never again
    if (inFlightRef.current.has(bc.id)) return; // already queued/visible
    inFlightRef.current.add(bc.id);
    setQueue((q) => (q.length >= MAX_QUEUE ? q : [...q, bc]));
  }, [user]);

  // Pull the next popup once the current one is dismissed.
  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [current, queue]);

  const dismiss = useCallback(() => {
    if (!current) return;
    // Mark as seen the moment the user closes it — one-time per broadcast.
    seenRef.current.add(current.id);
    inFlightRef.current.delete(current.id);
    persistSeenIds(seenRef.current);
    setCurrent(null);
  }, [current]);

  const loadActive = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.get('/admin/super/active-broadcast');
      if (res.data?.data) tryShow(res.data.data);
    } catch {
      // Unauthorized, offline, or no broadcast — nothing to show.
    }
  }, [isAuthenticated, tryShow]);

  // Poll once when auth becomes available and on every foreground. This is what
  // surfaces a broadcast that was sent while the app was closed — the "opened
  // the app for the first time after it was sent" case.
  useEffect(() => {
    loadActive();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadActive();
    });
    return () => sub.remove();
  }, [loadActive]);

  // Realtime: a broadcast sent while the app is open pops up immediately.
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (data: any) => tryShow(data);
    socketService.on('broadcast_notification', handler);
    return () => {
      socketService.off('broadcast_notification', handler);
    };
  }, [isAuthenticated, tryShow]);

  const dismissable = !!current;

  return (
    <>
      {children}
      <Modal
        visible={dismissable}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <Animated.View style={[styles.overlay, { opacity: overlayOp }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel={t('Dismiss')} />
          <Animated.View
            style={[
              styles.card,
              { transform: [{ scale: cardScale }], marginTop: Math.max(insets.top, 24) },
            ]}
          >
            <Pressable onPress={dismiss} style={styles.closeBtn} hitSlop={10} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={20} color={Colors.inkFaint} />
            </Pressable>

            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="bullhorn" size={30} color={Colors.orange} />
            </View>

            <Text style={styles.eyebrow}>{t('Announcement')}</Text>

            <Text style={styles.title} numberOfLines={3}>
              {current?.title}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.body}>{current?.body}</Text>

            <Pressable
              onPress={dismiss}
              style={({ pressed }) => [
                styles.gotItBtn,
                pressed && { transform: [{ translateX: 3 }, { translateY: 3 }] },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.gotItText}>{t('Got it')}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 13, 13, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.cream,
    borderWidth: 2,
    borderColor: Colors.ink,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.ink,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    color: Colors.orange,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 22,
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 28,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: Colors.inkHair,
    marginVertical: 16,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.inkLight,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 24,
  },
  gotItBtn: {
    alignSelf: 'stretch',
    backgroundColor: Colors.orange,
    borderWidth: 2,
    borderColor: Colors.ink,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 0,
    elevation: 3,
  },
  gotItText: {
    ...Typography.heading,
    fontSize: Typography.size.md,
    color: Colors.onOrange,
  },
});
