import { prisma } from '../config/prisma';

export interface AccountStatus {
 /** True when the account is banned at the user level OR the worker-profile level. */
  banned: boolean;
 /** True for a permanent worker-profile ban (chat-violation permanent ban). */
  permanentlyBanned: boolean;
 /** True when the worker wallet is overdrawn (unpaid penalties) or explicitly frozen. */
  frozen: boolean;
 /** Whether the ban lives on the User row (admin-applied, can carry an expiry). */
  userBanned: boolean;
 /** Whether the ban lives on the WorkerProfile row (chat-violation ban system). */
  workerBanned: boolean;
  banReason: string | null;
 /** Only user-level bans expire; worker-profile bans persist until an admin acts. */
  banExpiresAt: Date | null;
}

const DEFAULT_STATUS: AccountStatus = {
  banned: false,
  permanentlyBanned: false,
  frozen: false,
  userBanned: false,
  workerBanned: false,
  banReason: null,
  banExpiresAt: null,
};

/**
 * Single source of truth for account restrictions. Both the HTTP auth middleware
 * and the Socket.IO layer call this so HTTP and realtime enforce identical rules.
 *
 * A single joined query keeps the hot path (every authenticated request) to one
 * DB round-trip. Returns `null` when the user does not exist.
 *
 * NOTE: `frozen` deliberately does NOT block wallet top-ups — a frozen user must
 * be able to add funds to clear their debt (payment.controller.verifyWalletTopup
 * clears `isFrozen` once the balance reaches zero).
 */
export async function getAccountStatus(userId: string): Promise<AccountStatus | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isBanned: true,
      banReason: true,
      banExpiresAt: true,
      workerProfile: {
        select: {
          isBanned: true,
          isPermanentlyBanned: true,
          isFrozen: true,
          walletBalance: true,
          banReason: true,
        },
      },
    },
  });

  if (!user) return null;

  const worker = user.workerProfile;
  return {
    banned: !!(user.isBanned || worker?.isBanned || worker?.isPermanentlyBanned),
    permanentlyBanned: !!worker?.isPermanentlyBanned,
    frozen: !!(worker?.isFrozen || (worker && (worker.walletBalance ?? 0) < 0)),
    userBanned: !!user.isBanned,
    workerBanned: !!(worker?.isBanned || worker?.isPermanentlyBanned),
    banReason: user.banReason ?? worker?.banReason ?? null,
    banExpiresAt: user.banExpiresAt ?? null,
  };
}

export { DEFAULT_STATUS };
