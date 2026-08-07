import { useEffect, useRef } from 'react';
import { socketService } from '../api/socket';
import { notificationBus } from '../utils/notificationBus';

/**
 * Wallet notification types that mean the balance may have changed. Mirrors the
 * backend's payment/wallet push types (backend notification.service.ts) so a
 * worker getting paid, a wallet top-up, a wallet payment, a refund, a
 * cancellation fee or a withdrawal all trigger a refresh.
 */
const WALLET_NOTIFICATION_TYPES = new Set([
  'payment_success',
  'payment_received',
  'payment_failed',
  'wallet_credited',
  'wallet',
  'withdrawal',
  'refund',
  'cancellation_fee',
]);

// The socket event and the foreground push for the SAME notification arrive
// almost simultaneously; collapse them into one refetch instead of two.
const DEDUP_MS = 3000;

/**
 * Refetch wallet-bearing data in realtime whenever a wallet-affecting
 * notification arrives. Listens to BOTH the socket (`new_notification`, live
 * while connected) and the notification bus (which foreground pushes feed, so a
 * payment that arrives while the socket is down still refreshes the wallet).
 *
 * Use on any screen that renders a wallet balance or wallet transactions.
 */
export function useRealtimeWalletRefresh(refetch: () => void) {
  const refetchRef = useRef(refetch);
  const lastRefetchRef = useRef(0);

  // Always call the LATEST refetch closure (it captures current state, e.g.
  // the resolved city on the customer home screen) without re-subscribing the
  // socket/bus listeners below, which are registered once on mount.
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    const requestRefetch = () => {
      const now = Date.now();
      if (now - lastRefetchRef.current < DEDUP_MS) return;
      lastRefetchRef.current = now;
      refetchRef.current();
    };

    const isWalletNotification = (notification: any) =>
      !!notification?.type && WALLET_NOTIFICATION_TYPES.has(notification.type);

    const socketHandler = (notification: any) => {
      if (isWalletNotification(notification)) requestRefetch();
    };
    const busHandler = (notification: any) => {
      if (isWalletNotification(notification)) requestRefetch();
    };

    socketService.on('new_notification', socketHandler);
    const unsubscribe = notificationBus.subscribe(busHandler);

    return () => {
      socketService.off('new_notification', socketHandler);
      unsubscribe();
    };
  }, []);
}
