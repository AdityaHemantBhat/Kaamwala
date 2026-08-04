/**
 * Tiny module-level event bus that bridges "a notification arrived" (from
 * socket.io `new_notification` events and foreground push notifications) to the
 * in-app banner provider. Module-level so it works outside the React tree
 * (e.g. from expo-notifications listeners and the socket service).
 */

type NotificationHandler = (notification: any) => void;

const handlers = new Set<NotificationHandler>();

export const notificationBus = {
  subscribe(handler: NotificationHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  },
  emit(notification: any) {
    handlers.forEach((handler) => {
      try {
        handler(notification);
      } catch {
        // A single bad listener must never break delivery to the others.
      }
    });
  },
};
