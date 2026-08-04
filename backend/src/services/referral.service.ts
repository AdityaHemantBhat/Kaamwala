import { prisma } from '../config/prisma';
import { generateReferralCode } from '../utils/referral-code';

export const referralService = {
  async getOrCreateCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (user?.referralCode) return user.referralCode;

    const code = generateReferralCode();
    await prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
    return code;
  },

  async processReferral(referralCode: string, referredUserId: string) {
    // Find the referrer
    const referrer = await prisma.user.findFirst({
      where: { referralCode },
    });

    if (!referrer || referrer.id === referredUserId) return null;

    // Check if already referred
    const existing = await prisma.referralEvent.findFirst({
      where: { referredId: referredUserId },
    });
    if (existing) return null;

    // The event is recorded immediately but NO money moves yet — both bonuses
    // (referred ₹50, referrer ₹75) are credited together on the referred user's
    // FIRST completed booking (creditReferralBonuses). This closes the referral-
    // farming vector where fresh burner accounts instantly pocketed ₹50.
    const event = await prisma.referralEvent.create({
      data: {
        referrerId: referrer.id,
        referredId: referredUserId,
        referralCode,
        referrerBonus: 75,
        referredBonus: 50,
      },
    });

    return event;
  },

  /**
   * Credit both referral bonuses once, when the referred user completes their
   * first booking. Idempotent via bonusPaidAt — subsequent completions no-op.
   * Credits the wallet matching each party's role (worker vs customer profile).
   */
  async creditReferralBonuses(referredUserId: string) {
    const event = await prisma.referralEvent.findFirst({
      where: { referredId: referredUserId, bonusPaidAt: null },
    });
    if (!event) return;

    const creditWallet = async (tx: any, userId: string, amount: number, description: string) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, workerProfile: { select: { id: true } } },
      });
      const isWorker = user?.role === 'WORKER' && !!user.workerProfile;
      if (isWorker) {
        await tx.workerProfile.upsert({
          where: { userId },
          update: { walletBalance: { increment: amount } },
          create: {
            userId, category: 'PLUMBER', hourlyRate: 300,
            isAvailable: true, isOnline: true, walletBalance: amount,
          },
        });
      } else {
        await tx.customerProfile.upsert({
          where: { userId },
          update: { walletBalance: { increment: amount } },
          create: { userId, walletBalance: amount },
        });
      }
      await tx.transaction.create({
        data: { userId, type: 'REFERRAL_BONUS', amount, description, status: 'completed' },
      });
    };

    await prisma.$transaction(async (tx) => {
      await creditWallet(tx, referredUserId, event.referredBonus, 'Welcome bonus — referred by a friend (credited after your first booking)');
      await creditWallet(tx, event.referrerId, event.referrerBonus, 'Referral bonus — friend completed their first booking');
      await tx.referralEvent.update({
        where: { id: event.id },
        data: { bonusPaidAt: new Date() },
      });
    });
  },

  async getReferralStats(userId: string) {
    const [given, received, totalEarned] = await Promise.all([
      prisma.referralEvent.count({ where: { referrerId: userId } }),
      prisma.referralEvent.findMany({
        where: { referrerId: userId, bonusPaidAt: { not: null } },
        select: { referrerBonus: true },
      }),
      prisma.referralEvent.findFirst({
        where: { referredId: userId },
      }),
    ]);

    const earned = received.reduce((sum, r) => sum + r.referrerBonus, 0);

    return {
      totalReferrals: given,
      totalEarned: earned,
      wasReferred: !!received,
    };
  },
};
