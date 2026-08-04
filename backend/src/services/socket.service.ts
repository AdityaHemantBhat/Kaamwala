import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/crypto';
import { haversineDistance } from '../utils/haversine';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { createAuditLog, AuditContext } from '../utils/audit';
import { getAccountStatus } from '../utils/accountStatus';
import { encryptField } from '../utils/fieldEncryption';
import { mapsService } from './maps.service';
import { notificationService } from './notification.service';

let io: Server;
let locationUpdateCounter = 0;

/** True when `userId` is the customer or worker of `bookingId`. */
async function isBookingParticipant(bookingId: string, userId: string): Promise<boolean> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true, workerId: true },
    });
    return !!booking && (booking.customerId === userId || booking.workerId === userId);
  } catch {
    return false;
  }
}

// Fallback in-memory violation tracker (used when Redis is unavailable)
const memoryViolations = new Map<string, { count: number }>();

// Financial penalties escalate with each violation
function getPenaltyAmount(count: number): number {
  if (count <= 1) return 0;     // 1st: warning only
  if (count === 2) return 30;   // 2nd: Rs.30
  if (count === 3) return 70;   // 3rd: Rs.70
  return 0;                     // 4th: ban (handled separately, no penalty)
}

async function applyFinancialPenalty(userId: string, amount: number): Promise<{ deducted: boolean; walletBalance: number }> {
  if (amount <= 0) return { deducted: false, walletBalance: 0 };

  try {
    // Check if user is a worker (has WorkerProfile with wallet)
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId } });
    if (workerProfile) {
      const currentBalance = workerProfile.walletBalance || 0;
      const newBalance = currentBalance - amount;

      const updated = await prisma.workerProfile.update({
        where: { userId },
        data: { walletBalance: newBalance, isFrozen: newBalance < 0 },
      });

      await prisma.transaction.create({
        data: { userId, bookingId: undefined, type: 'PENALTY', amount: -amount,
          description: newBalance < 0
            ? 'Penalty for sharing contact info. Wallet overdrawn to Rs.' + newBalance + '. Add funds to unfreeze.'
            : 'Penalty for sharing contact info (Rs.' + amount + ')',
          status: 'completed',
        },
      });

      return { deducted: true, walletBalance: updated.walletBalance };
    }

    // Check if user is a customer (has CustomerProfile with wallet)
    const customerProfile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (customerProfile) {
      const currentBalance = customerProfile.walletBalance || 0;
      const newBalance = currentBalance - amount;

      await prisma.customerProfile.update({
        where: { userId },
        data: { walletBalance: newBalance },
      });

      await prisma.transaction.create({
        data: { userId, bookingId: undefined, type: 'PENALTY', amount: -amount,
          description: 'Penalty for sharing contact info (Rs.' + amount + ')',
          status: 'completed',
        },
      });

      return { deducted: true, walletBalance: newBalance };
    }

    // No wallet found — can't deduct
    return { deducted: false, walletBalance: 0 };
  } catch (e) {
    logger.error('Failed to apply financial penalty:', e);
    return { deducted: false, walletBalance: 0 };
  }
}

async function applyBan(userId: string, reason: string, permanent: boolean = false, ctx?: AuditContext): Promise<void> {
  try {
    const data: any = {
      banReason: reason,
      bannedAt: new Date(),
      isAvailable: false,
      isOnline: false,
    };
    if (permanent) {
      data.isPermanentlyBanned = true;
      data.isBanned = false;
    } else {
      data.isBanned = true;
    }
    const exists = await prisma.workerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (exists) {
      await prisma.workerProfile.update({ where: { userId }, data });
    }
    await createAuditLog(prisma, ctx, {
      userId,
      action: permanent ? 'WORKER_PERMANENTLY_BANNED' : 'WORKER_BANNED',
      resource: 'worker',
      resourceId: userId,
      newValue: { reason, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    logger.error('Failed to apply ban:', e);
  }
}

async function incrementViolation(userId: string, ctx?: AuditContext): Promise<{ count: number; penalty: number; deducted: boolean; walletBalance: number }> {
  let newCount = 0;
  try {
    newCount = await redis.incr(`chat_violations:${userId}`);
  } catch {
    const record = memoryViolations.get(userId) || { count: 0 };
    record.count++;
    memoryViolations.set(userId, record);
    newCount = record.count;
  }

  const penaltyAmount = getPenaltyAmount(newCount);
  let walletBalance = 0;
  let deducted = false;

  // 4th violation = ban (check if already been unbanned before)
  if (newCount >= 4) {
    const profile = await prisma.workerProfile.findUnique({ where: { userId }, select: { isPermanentlyBanned: true, appealCount: true } });
    if (profile?.isPermanentlyBanned) {
      // Already had a chance — permanent ban, no appeal
      await applyBan(userId, 'Permanent ban: violated after previous appeal was granted.', true, ctx);
    } else if (profile && profile.appealCount > 0) {
      // This is a violation AFTER being unbanned via appeal — permanent ban
      await applyBan(userId, 'Permanent ban: violated after appeal.', true, ctx);
    } else {
      // First ban — can appeal
      await applyBan(userId, 'Banned: multiple chat violations (sharing contact info). You can appeal this ban.', false, ctx);
    }
  }

  if (penaltyAmount > 0) {
    const result = await applyFinancialPenalty(userId, penaltyAmount);
    deducted = result.deducted;
    walletBalance = result.walletBalance;
  }

  try {
    await createAuditLog(prisma, ctx, {
      userId,
      action: 'CHAT_PHONE_SHARE',
      resource: 'chat',
      resourceId: userId,
      newValue: { count: newCount, penalty: penaltyAmount, walletBalance, windowHours: 24, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    logger.error('Failed to log chat violation:', e);
  }

  return { count: newCount, penalty: penaltyAmount, deducted, walletBalance };
}

/**
 * Initialize Socket.IO server instance.
 * Called from index.ts during Phase 1.
 * Event listeners are registered separately via registerSocketListeners() after server.listen().
 */
export const initSocket = (serverIo: Server) => {
  io = serverIo;
  logger.info('[Startup] Socket.IO server instance created (listeners deferred)');
};

/**
 * Register Socket.IO event listeners and middleware.
 * Called from index.ts via setImmediate() after server.listen() completes.
 * This ensures Socket.IO doesn't block startup.
 */
export const registerSocketListeners = () => {
  if (!io) {
    logger.error('[Socket.IO] Server not initialized; cannot register listeners');
    return;
  }

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    let decoded: any;
    try {
      decoded = verifyAccessToken(token);
    } catch (e) {
      return next(new Error('Invalid token'));
    }

    // Fail closed on the account-restriction lookup, and reject banned accounts
    // at the handshake so HTTP and realtime enforce the same authorization.
    // Frozen users stay connected (notifications) but are blocked per-event.
    try {
      const status = await getAccountStatus(decoded.userId);
      if (!status) return next(new Error('Invalid token'));
      if (status.banned) return next(new Error('Account banned'));
    } catch (e) {
      return next(new Error('Service unavailable'));
    }

    socket.data.user = decoded;
    next();
  });

  // Connection handler
  io.on('connection', (socket) => {
    const { userId, role } = socket.data.user;
    logger.debug(`Socket connected: ${socket.id} for user ${userId} (${role})`);
    
    // Join personal room for notifications
    socket.join(`user_${userId}`);
    
    socket.on('join_booking_chat', async ({ bookingId }) => {
      // Only the booking's customer/worker may join its room (chat privacy).
      if (!(await isBookingParticipant(bookingId, userId))) {
        socket.emit('room_join_error', { message: 'You are not a participant of this booking.' });
        return;
      }
      socket.join(`booking_${bookingId}`);
      logger.debug(`User ${userId} joined chat room booking_${bookingId}`);
    });

    socket.on('send_message', async ({ bookingId, content }) => {
      // Authorize before persisting/broadcasting — anyone could otherwise inject
      // messages into any booking's chat.
      if (!(await isBookingParticipant(bookingId, userId))) {
        socket.emit('message_error', 'You are not a participant of this booking.');
        return;
      }

      // Single account-restriction check shared with HTTP (user + worker bans,
      // freeze). Frozen users may receive notifications but cannot send chat.
      const status = await getAccountStatus(userId);
      if (!status || status.banned) {
        socket.emit('chat_warning', {
          message: status?.permanentlyBanned
            ? 'Your account is permanently banned. This decision is final.'
            : 'Your account is banned. You can appeal by paying a Rs.100 fee. Reason: ' + (status?.banReason || 'N/A'),
          banned: true,
          permanent: !!status?.permanentlyBanned,
          canAppeal: !status?.permanentlyBanned,
        });
        return;
      }
      if (status.frozen) {
        socket.emit('chat_warning', {
          message: 'Your account is frozen due to unpaid penalties. Clear your penalty debt to continue using chat.',
          frozen: true,
        });
        return;
      }

      // Deterministic Chat Filter — block phone numbers
      const phoneRegex = /(\d\s*[-.]?\s*){10}/g;
      if (phoneRegex.test(content)) {
        // CUSTOMER: educational warning, no penalty
        if (role === 'CUSTOMER') {
          socket.emit('chat_warning', {
            message: 'Stay protected with KaamWalla. Sharing contact details and completing the job outside KaamWalla may mean the transaction is not covered by KaamWalla support, applicable warranty, or platform protections.',
            educational: true,
          });
          return; // Don't emit to room
        }

        // WORKER: existing penalty system (violations, wallet deduction, bans)
        const result = await incrementViolation(userId, { ip: socket.handshake.address });

        let msg = 'Sharing contact info is prohibited.';
        if (result.penalty > 0) {
          if (result.walletBalance < 0) {
            msg = 'VIOLATION #' + result.count + ' — Rs.' + result.penalty + ' penalty. Wallet overdrawn to Rs.' + result.walletBalance + '. Account FROZEN. Add funds to unfreeze.';
          } else if (result.deducted) {
            msg = 'VIOLATION #' + result.count + ' — Rs.' + result.penalty + ' penalty deducted. Wallet balance: Rs.' + result.walletBalance + '.';
          } else {
            msg = 'VIOLATION #' + result.count + ' — Warning: sharing contact info is prohibited.';
          }
        } else {
          msg = 'WARNING #' + result.count + ' — Sharing contact info is prohibited. Next violation will incur a Rs.30 penalty.';
        }

        socket.emit('chat_warning', {
          message: msg,
          penalty: result.penalty,
          deducted: result.deducted,
          walletBalance: result.walletBalance,
          violations: result.count,
          frozen: result.walletBalance < 0,
        });
        return; // Don't emit to room
      }

      try {
        const message = await prisma.$transaction(async (tx) => {
          let chat = await tx.chat.findUnique({ where: { bookingId } });
          if (!chat) {
            chat = await tx.chat.create({ data: { bookingId } });
          }
          return await tx.message.create({
            // Stored encrypted at rest; the plaintext is emitted to the room.
            data: { chatId: chat.id, senderId: userId, content: encryptField(content), type: 'text' },
            include: { sender: { select: { name: true, role: true } } }
          });
        });

        io.to('booking_' + bookingId).emit('new_message', {
          id: message.id, chatId: message.chatId, senderId: message.senderId,
          sender: message.sender, type: message.type, content, // plaintext
          mediaUrl: message.mediaUrl, isRead: message.isRead, isDeleted: message.isDeleted,
          createdAt: message.createdAt
        });

        try {
          const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true, workerId: true } });
          if (booking) {
            const recipientId = booking.customerId === userId ? booking.workerId : booking.customerId;
            const preview = content.substring(0, 100);
            await notificationService.sendPushNotification(recipientId, 'New message', preview, 'chat_message', { bookingId });
          }
        } catch {}

      } catch (error: any) {
        logger.error('Failed to save message:', error);
        socket.emit('message_error', 'Failed to send message');
      }
    });

    socket.on('worker:location_update', async ({ bookingId, lat, lng }) => {
      if (role !== 'WORKER') return;
      // Reject malformed GPS so bogus fixes never reach the map or the DB.
      if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

      let eta: number | null = null;
      try {
        // Only the booking's assigned worker may post location for it.
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: {
            workerId: true,
            address: { select: { latitude: true, longitude: true, city: true } },
          },
        });
        if (!booking || booking.workerId !== userId) return;

        // Persist the live position on EVERY update, regardless of whether the
        // destination coordinates are valid, so a polling/reconnecting customer
        // always gets the latest fix via GET /tracking.
        const destValid = !!booking.address
          && isFinite(booking.address.latitude) && isFinite(booking.address.longitude)
          && (booking.address.latitude !== 0 || booking.address.longitude !== 0);

        if (destValid) {
          locationUpdateCounter++;
          // Try Google Maps ETA every ~15th call, fallback to haversine
          if (locationUpdateCounter % 15 === 0) {
            try {
              const etaSeconds = await mapsService.getETA(lat, lng, booking.address.latitude, booking.address.longitude);
              if (etaSeconds !== null) eta = Math.round(etaSeconds / 60);
            } catch {}
          }
          if (eta === null) {
            const distKm = haversineDistance(lat, lng, booking.address.latitude, booking.address.longitude);
            if (distKm > 10) eta = null;  // Too far - don't show unreliable ETA
            else eta = Math.round(distKm / 0.5);
            if (distKm < 0.2) eta = 0;
          }
        } else if (booking.address?.city) {
          eta = 15;
        }

        await prisma.booking.update({
          where: { id: bookingId },
          data: { workerLat: lat, workerLng: lng, workerEta: eta },
        });

        const workerProfile = await prisma.workerProfile.findUnique({ where: { userId } });
        if (workerProfile) {
          await prisma.workerLocation.create({
            data: { workerProfileId: workerProfile.id, bookingId, latitude: lat, longitude: lng },
          });
        }
      } catch (e) { /* silent — a single failed update must never break tracking */ }

      io.to(`booking_${bookingId}`).emit('worker_location_updated', { lat, lng, eta });
    });

    socket.on('worker:stop_sharing', async ({ bookingId }) => {
      if (role === 'WORKER') {
        try {
          // updateMany + workerId guard = authorization and update in one atomic call.
          await prisma.booking.updateMany({
            where: { id: bookingId, workerId: userId },
            data: { workerLat: null, workerLng: null, workerEta: null }
          });
        } catch (e) {}
        io.to(`booking_${bookingId}`).emit('worker_stopped_sharing');
      }
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });
};

export const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const emitToUser = (userId: string, event: string, data: any) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

export const emitToBooking = (bookingId: string, event: string, data: any) => {
  if (io) {
    io.to(`booking_${bookingId}`).emit(event, data);
  }
};

const ADMIN_IDS_CACHE_TTL_MS = 60_000;
let cachedAdminIds: string[] | null = null;
let adminIdsCachedAt = 0;

async function getAdminIds(): Promise<string[]> {
  if (cachedAdminIds && Date.now() - adminIdsCachedAt < ADMIN_IDS_CACHE_TTL_MS) {
    return cachedAdminIds;
  }
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  cachedAdminIds = admins.map(a => a.id);
  adminIdsCachedAt = Date.now();
  return cachedAdminIds;
}

export const emitToAdmins = async (event: string, data: any) => {
  if (io) {
    try {
      const admins = await getAdminIds();
      admins.forEach(adminId => {
        io.to(`user_${adminId}`).emit(event, data);
      });
    } catch (e) {
      logger.error('Error emitting to admins', e);
    }
  }
};

/** Emit a broadcast notification to all connected users of a specific role. */
export const emitToRole = async (role: 'WORKER' | 'CUSTOMER' | 'ADMIN', event: string, data: any) => {
  if (!io) return;
  try {
    const users = await prisma.user.findMany({
      where: { role },
      select: { id: true },
    });
    users.forEach(user => {
      io.to(`user_${user.id}`).emit(event, data);
    });
  } catch (e) {
    logger.error(`Error emitting to ${role}s`, e);
  }
};

/** Emit a broadcast to all connected users (for platform-wide announcements). */
export const emitBroadcast = async (event: string, data: any) => {
  if (io) {
    io.emit(event, data);
  }
};
