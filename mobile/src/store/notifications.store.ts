import { create } from 'zustand';

/**
 * Global unread-notification count + banner-suppression flag, kept fresh in
 * realtime by socket events and foreground pushes. Dashboard/home badges read
 * this instead of polling the full list every 15s (which the old code did just
 * to count unread).
 */
interface NotificationsState {
  unreadCount: number;
  /** True while the notifications screen is focused — suppress in-app banners. */
  suppressBanners: boolean;
  /** Set from the server's unread-count endpoint (authoritative on load). */
  setUnreadCount: (count: number) => void;
  /** A new notification just arrived. */
  bumpUnread: () => void;
  /** A notification was marked read. */
  decrementUnread: () => void;
  /** Inbox was cleared / all marked read. */
  resetUnread: () => void;
  setSuppressBanners: (value: boolean) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  unreadCount: 0,
  suppressBanners: false,
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, Math.round(count)) }),
  bumpUnread: () => set({ unreadCount: get().unreadCount + 1 }),
  decrementUnread: () => set({ unreadCount: Math.max(0, get().unreadCount - 1) }),
  resetUnread: () => set({ unreadCount: 0 }),
  setSuppressBanners: (value) => set({ suppressBanners: value }),
}));
