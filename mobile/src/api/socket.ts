import { io, Socket } from 'socket.io-client';
import { env } from '../config/env';
import { useAuthStore } from '../store/auth.store';
import { logger } from '../utils/logger';

class SocketService {
  private socket: Socket | null = null;
  private pendingListeners: { event: string; callback: (...args: any[]) => void }[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;
  // Booking rooms this device has joined. Socket.io rooms do not survive a
  // reconnect, so they are re-joined on every (re)connect — otherwise live
  // tracking would silently stop after a dropped connection.
  private bookingRooms = new Set<string>();

  connect() {
    // Already connected
    if (this.socket?.connected) return;
    // Prevent duplicate connection attempts
    if (this.isConnecting) return;
    // Reset socket if it's dead
    if (this.socket && !this.socket.connected) {
      this.socket.disconnect();
      this.socket = null;
    }

    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;

    this.isConnecting = true;

    // Use websocket first, fall back to polling if it fails
    this.socket = io(env.API_URL.replace('/api/v1', ''), {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      forceNew: true,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      logger.info('Socket connected:', this.socket?.id);
      // Re-register listeners that were added before connect
      for (const { event, callback } of this.pendingListeners) {
        this.socket?.on(event, callback);
      }
      // Re-join booking rooms (rooms are lost on reconnect).
      this.bookingRooms.forEach((bookingId) => {
        this.socket?.emit('join_booking_chat', { bookingId });
      });
    });

    this.socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected:', reason);
      this.isConnecting = false;
    });

    this.socket.on('connect_error', (error) => {
      this.isConnecting = false;
      this.reconnectAttempts++;

      // Ignore common transient React Native transport errors during auto-retry
      const isTransient = ['websocket error', 'timeout', 'xhr poll error'].includes(error?.message);
      if (this.reconnectAttempts <= 2 && !isTransient) {
        logger.warn('Socket connecting...', error?.message || error);
      }

      // Handle auth token expiry — refresh and reconnect
      if (error?.message === 'Invalid token' || error?.message === 'Authentication required') {
        const newToken = useAuthStore.getState().accessToken;
        if (newToken && this.socket) {
          this.socket.auth = { token: newToken };
          this.socket.connect();
          return;
        }
      }

      // Stop after max attempts to avoid infinite retry loop
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.reconnectAttempts === this.maxReconnectAttempts) {
          logger.warn('Socket offline — will reconnect when app resumes.');
        }
        this.disconnect();
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.bookingRooms.clear();
  }

  // Reconnect manually (e.g., after app foreground)
  reconnect() {
    this.reconnectAttempts = 0;
    this.connect();
  }

  joinBookingChat(bookingId: string) {
    this.bookingRooms.add(bookingId);
    if (this.socket) {
      this.socket.emit('join_booking_chat', { bookingId });
    }
  }

  emitLocationUpdate(bookingId: string, lat: number, lng: number, accuracy?: number | null) {
    if (this.socket) {
      this.socket.emit('worker:location_update', {
        bookingId,
        lat,
        lng,
        ...(typeof accuracy === 'number' ? { accuracy } : {}),
      });
    }
  }

  sendMessage(bookingId: string, content: string) {
    if (this.socket) {
      this.socket.emit('send_message', { bookingId, content });
    }
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    // Queue for re-registration on (re)connect
    if (!this.pendingListeners.some(l => l.event === event)) {
      this.pendingListeners.push({ event, callback });
    }
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    // Remove from pending queue
    this.pendingListeners = this.pendingListeners.filter(
      l => l.event !== event || (callback && l.callback !== callback)
    );
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const socketService = new SocketService();
