import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiClient } from '../api/client';
import { socketService } from '../api/socket';
import { useNotificationsStore } from '../store/notifications.store';

const PAGE_SIZE = 30;

/**
 * Shared logic for the customer + worker notification history screens:
 * paginated loading, realtime prepend (deduped by id), mark-read, mark-all-read,
 * per-item delete and clear-all. Also keeps the global unread badge in sync.
 */
export function useNotifications() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    try {
      const params: any = { limit: PAGE_SIZE };
      if (cursor) params.cursor = cursor;
      const res = await apiClient.get('/notifications', { params });
      const { items: page, nextCursor: nc, hasMore: hm, unreadCount } = res.data?.data || { items: [] };
      setItems((prev) => {
        if (!cursor) return page;
        const known = new Set(prev.map((n) => n.id));
        return [...prev, ...page.filter((n: any) => !known.has(n.id))];
      });
      setNextCursor(nc || null);
      setHasMore(!!hm);
      if (typeof unreadCount === 'number') {
        useNotificationsStore.getState().setUnreadCount(unreadCount);
      }
    } catch {
      // Keep whatever we already have.
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    load(nextCursor);
  }, [hasMore, loadingMore, nextCursor, load]);

  // Initial load + pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const markRead = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.isRead) useNotificationsStore.getState().decrementUnread();
      return prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    });
    apiClient.put(`/notifications/${id}/read`).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    useNotificationsStore.getState().resetUnread();
    apiClient.put('/notifications/read-all').catch(() => {});
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.isRead) useNotificationsStore.getState().decrementUnread();
      return prev.filter((n) => n.id !== id);
    });
    apiClient.delete(`/notifications/${id}`).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    useNotificationsStore.getState().resetUnread();
    apiClient.delete('/notifications').catch(() => {});
  }, []);

  // Realtime: prepend new notifications (deduped by id).
  useEffect(() => {
    const handler = (notif: any) => {
      setItems((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
    };
    socketService.on('new_notification', handler);
    return () => {
      socketService.off('new_notification', handler);
    };
  }, []);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    markRead,
    markAllRead,
    remove,
    clearAll,
  };
}
