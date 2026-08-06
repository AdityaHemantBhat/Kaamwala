import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useT, translateDynamic } from '../../utils/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { useNotifications } from '../../hooks/useNotifications';
import { getNotificationMeta, resolveNotificationRoute } from '../../utils/notificationMeta';
import { SkeletonNotificationsBody } from '../../components/ui/SkeletonScreenLayouts';
import { SwipeableNotificationRow } from '../../components/ui/SwipeableNotificationRow';

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const date = new Date(dateStr).getTime();
  if (Number.isNaN(date)) return '';
  const diff = Date.now() - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('Just now');
  if (mins < 60) return `${mins}${t('m ago')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${t('h ago')}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return t('Yesterday');
  if (days < 7) return `${days}${t('d ago')}`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function WorkerNotifications() {
  const router = useRouter();
  const t = useT();
  const role = useAuthStore((s) => s.user?.role as any);
  const { items, loading, refreshing, loadingMore, hasMore, loadMore, refresh, markRead, markAllRead, remove, clearAll } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      useNotificationsStore.getState().setSuppressBanners(true);
      return () => useNotificationsStore.getState().setSuppressBanners(false);
    }, [])
  );

  const unreadCount = items.filter((n) => !n.isRead).length;

  const handleTap = (notif: any) => {
    if (!notif.isRead) markRead(notif.id);
    const route = resolveNotificationRoute(notif, role);
    if (route) router.push(route as never);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) {
      loadMore();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Notifications')}</Text>
        <View style={{ flex: 1 }} />
        {!loading && (
          <>
            {items.length > 0 && (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel={t('Clear all notifications')}
              >
                <MaterialCommunityIcons name="delete-sweep-outline" size={16} color="#8B1A1A" />
              </Pressable>
            )}
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel={t('Mark all read')}
              >
                <MaterialCommunityIcons name="check-all" size={16} color="#FF5C00" />
              </Pressable>
            )}
          </>
        )}
      </View>

      {loading ? (
        <SkeletonNotificationsBody />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.heroRing}>
            <MaterialCommunityIcons name="bell-outline" size={48} color="#0D0D0D" />
          </View>
          <Text style={styles.emptyTitle}>{t('No notifications')}</Text>
          <Text style={styles.emptySub}>{t('Updates will appear here')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          onScroll={onScroll}
          scrollEventThrottle={120}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#0D0D0D" />}
        >
          {items.map((n) => {
            const m = getNotificationMeta(n.type);
            return (
              <SwipeableNotificationRow key={n.id} id={n.id} onRemove={remove} style={{ marginBottom: 10 }}>
                <Pressable
                  onPress={() => handleTap(n)}
                  style={({ pressed }) => [
                    styles.notifItem,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={[styles.notifIconWrap, { backgroundColor: m.color + '18' }]}>
                    <MaterialCommunityIcons name={m.icon as any} size={22} color={m.color} />
                  </View>
                  <View style={styles.notifTextWrap}>
                    <Text style={[styles.notifTitle, !n.isRead && styles.notifTitleBold]}>{translateDynamic(n.title)}</Text>
                    <Text style={styles.notifBody} numberOfLines={2}>{translateDynamic(n.body)}</Text>
                    <Text style={styles.notifTime}>{timeAgo(n.createdAt, t)}</Text>
                  </View>
                  {!n.isRead && <View style={styles.unreadDot} />}
                </Pressable>
              </SwipeableNotificationRow>
            );
          })}

          {hasMore && (
            <Pressable onPress={loadMore} style={styles.loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color="#FF5C00" />
              ) : (
                <Text style={styles.loadMoreText}>{t('Load more')}</Text>
              )}
            </Pressable>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  headerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  heroRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: '#6B6B6B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#A8A090',
  },
  notifItem: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    paddingLeft: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    alignItems: 'flex-start',
    borderLeftWidth: 0,
    borderLeftColor: 'transparent',
  },
  notifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTextWrap: { flex: 1, marginLeft: 14 },
  notifTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0D0D0D',
    lineHeight: 20,
  },
  notifTitleBold: { fontFamily: 'Inter_700Bold' },
  notifBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
    lineHeight: 18,
  },
  notifTime: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#A8A090',
    marginTop: 6,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5C00',
    marginTop: 6,
    marginLeft: 8,
  },
  loadMore: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  loadMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FF5C00',
  },
});
