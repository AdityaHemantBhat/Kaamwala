import { randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { sendPushToToken } from './push.service';
import { logger } from '../utils/logger';

const ENGAGEMENT_TEMPLATES = [
  { title: 'Need a hand today? 🛠️', body: 'Book a verified professional instantly on KaamWala.' },
  { title: 'Weekend Special! ✨', body: 'Get your pending tasks done. Tap to see available workers.' },
  { title: 'Grab the deal on Home Cleaning! 🧹', body: 'Special discounts on verified cleaners this week.' },
  { title: 'Hungry for free time? 🍔', body: 'Let us handle the chores while you relax!' },
  { title: 'Fix it before it breaks! 🔧', body: 'Hire expert plumbers and electricians now.' },
];

/**
 * Picks a random promotional template and broadcasts it to all CUSTOMER users.
 */
export async function runEngagementCampaign(): Promise<number> {
  try {
    const template = ENGAGEMENT_TEMPLATES[Math.floor(Math.random() * ENGAGEMENT_TEMPLATES.length)];
    
    // Fetch all customers with an active push token
    const users = await prisma.user.findMany({
      where: { 
        role: 'CUSTOMER',
        fcmToken: { not: null }
      },
      select: { id: true, fcmToken: true }
    });

    if (users.length === 0) return 0;

    const broadcastId = randomUUID();

    // Store the broadcast in the notification history for these users
    // This allows it to show up in the in-app notification center too.
    await prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        title: template.title,
        body: template.body,
        type: 'promotional',
        data: { targetRole: 'CUSTOMER', broadcastId },
        status: 'DELIVERED', // Don't trigger standard push retries for broadcasts
      })),
      skipDuplicates: true
    });

    let sentCount = 0;
    const pushData = { targetRole: 'CUSTOMER', broadcastId };

    // Fire off OS-level push notifications
    for (const u of users) {
      if (!u.fcmToken) continue;
      
      sendPushToToken(u.fcmToken, { 
        title: template.title, 
        body: template.body, 
        channelId: 'promo', // Maps to Android 'Promotions' channel
        data: { type: 'promotional', ...pushData } 
      })
      .then((result) => {
        if (result.invalid) {
          // If token is dead, clear it
          prisma.user.update({ 
            where: { id: u.id }, 
            data: { fcmToken: null } 
          }).catch(() => {});
        }
      })
      .catch(() => {});
      
      sentCount++;
    }

    logger.info(`[Marketing] Engagement campaign sent to ${sentCount} customers`);
    return sentCount;
  } catch (error) {
    logger.error('[Marketing] Failed to run engagement campaign', error);
    return 0;
  }
}
