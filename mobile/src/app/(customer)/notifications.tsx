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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SkeletonNotificationsBody } from '../../components/ui/SkeletonScreenLayouts';
import { SwipeableNotificationRow } from '../../components/ui/SwipeableNotificationRow';
import { useRouter, useFocusEffect } from 'expo-router';
import { useT, translateDynamic } from '../../utils/i18n';
import { useNotificationsStore } from '../../store/notifications.store';
import { useNotifications } from '../../hooks/useNotifications';
import { getNotificationMeta, resolveNotificationRoute } from '../../utils/notificationMeta';
import { useAuthStore } from '../../store/auth.store';

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  if (Number.isNaN(date)) return '';
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

function groupNotifications(items: any[], t: (k: string) => string) {
  const groups: { title: string; data: any[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const todayItems = items.filter((n) => new Date(n.createdAt) >= today);
  const yesterdayItems = items.filter((n) => {
    const d = new Date(n.createdAt);
    return d >= yesterday && d < today;
  });
  const weekItems = items.filter((n) => {
    const d = new Date(n.createdAt);
    return d >= weekAgo && d < yesterday;
  });
  const olderItems = items.filter((n) => new Date(n.createdAt) < weekAgo);

  if (todayItems.length) groups.push({ title: t('Today'), data: todayItems });
  if (yesterdayItems.length) groups.push({ title: t('Yesterday'), data: yesterdayItems });
  if (weekItems.length) groups.push({ title: t('This Week'), data: weekItems });
  if (olderItems.length) groups.push({ title: t('Older'), data: olderItems });
  return groups;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const t = useT();
  const role = useAuthStore((s) => s.user?.role as any);
  const { items, loading, refreshing, loadingMore, hasMore, loadMore, refresh, markRead, markAllRead, remove, clearAll } = useNotifications();

  // Don't pop a banner while the user is already reading their inbox.
  useFocusEffect(
    useCallback(() => {
      useNotificationsStore.getState().setSuppressBanners(true);
      return () => useNotificationsStore.getState().setSuppressBanners(false);
    }, [])
  );

  const unreadCount = items.filter((n) => !n.isRead).length;
  const groups = groupNotifications(items, t);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SkeletonNotificationsBody withBack={false} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('Notifications')}</Text>
        <View style={styles.headerActions}>
          {items.length > 0 && (
            <Pressable
              onPress={clearAll}
              style={({ pressed }) => [styles.markAllBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={t('Clear all notifications')}
            >
              <MaterialCommunityIcons name="delete-sweep-outline" size={15} color="#8B1A1A" />
              <Text style={styles.clearAllText}>{t('Clear all')}</Text>
            </Pressable>
          )}
          {unreadCount > 0 && (
            <Pressable
              onPress={markAllRead}
              style={({ pressed }) => [styles.markAllBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={t('Mark all notifications as read')}
            >
              <Text style={styles.markAllText}>{t('Mark all read')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={120}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#FF5C00"
            colors={['#FF5C00']}
          />
        }
      >
        {items.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyRing}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="bell-outline" size={36} color="#FF5C00" />
              </View>
            </View>
            <Text style={styles.emptyTitle}>{t('All caught up!')}</Text>
            <Text style={styles.emptySub}>
              {t('You\'ll see notifications here when something happens')}
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.groupItems}>
                {group.data.map((notif) => {
                  const meta = getNotificationMeta(notif.type);
                  return (
                    <SwipeableNotificationRow key={notif.id} id={notif.id} onRemove={remove}>
                      <Pressable
                        onPress={() => handleTap(notif)}
                        style={({ pressed }) => [
                          styles.notifItem,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        {/* Icon */}
                        <View style={[styles.notifIcon, { backgroundColor: meta.color + '14' }]}>
                          <MaterialCommunityIcons name={meta.icon as any} size={22} color={meta.color} />
                        </View>

                        {/* Content */}
                        <View style={styles.notifContent}>
                          <Text style={[styles.notifTitle, !notif.isRead && styles.notifTitleBold]}>
                            {translateDynamic(notif.title)}
                          </Text>
                          <Text style={styles.notifBody} numberOfLines={2}>
                            {translateDynamic(notif.body)}
                          </Text>
                          <Text style={styles.notifTime}>{timeAgo(notif.createdAt, t)}</Text>
                        </View>

                        {/* Unread dot — Google-style indicator */}
                        {!notif.isRead && <View style={styles.unreadDot} />}
                      </Pressable>
                    </SwipeableNotificationRow>
                  );
                })}
              </View>
            </View>
          ))
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#0D0D0D',
  },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  markAllBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FF5C00',
  },
  clearAllText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#8B1A1A',
  },

  emptyBox: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },

  group: { marginTop: 24, paddingHorizontal: 28 },
  groupTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#6B6B6B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupItems: { gap: 8 },

  notifItem: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifContent: { flex: 1, marginLeft: 12 },
  notifTitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' },
  notifTitleBold: { fontFamily: 'Inter_700Bold' },
  notifBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
    lineHeight: 18,
  },
  notifTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#999999',
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5C00',
    marginTop: 4,
    marginLeft: 8,
  },
  loadMore: {
    marginTop: 20,
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
