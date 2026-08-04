import { prisma } from '../config/prisma';

export const feedService = {
  async getCityFeed(city: string, limit = 20) {
    const items = await prisma.activityFeedItem.findMany({
      where: { city },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items;
  },

  async addFeedEvent(city: string, category: string, eventType: string, message: string) {
    await prisma.activityFeedItem.create({
      data: { city, category: category as any, eventType, message },
    });

    // Keep only last 500 items per city
    const count = await prisma.activityFeedItem.count({ where: { city } });
    if (count > 500) {
      const oldest = await prisma.activityFeedItem.findMany({
        where: { city },
        orderBy: { createdAt: 'asc' },
        take: count - 500,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.activityFeedItem.deleteMany({
          where: { id: { in: oldest.map(o => o.id) } },
        });
      }
    }
  },

  async getCityStats(city: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayBookings,
      availableWorkers,
      completedToday,
      workersByCategory,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          address: { city },
          createdAt: { gte: today },
        },
      }),
      prisma.workerProfile.count({
        where: { city, isAvailable: true,
        isFrozen: false, isOnline: true, verificationStatus: 'VERIFIED' },
      }),
      prisma.booking.count({
        where: {
          address: { city },
          status: 'COMPLETED',
          completedAt: { gte: today },
        },
      }),
      prisma.workerProfile.groupBy({
        by: ['category'],
        where: { city, isAvailable: true, isOnline: true,
        isFrozen: false, verificationStatus: 'VERIFIED' },
        _count: true,
      }),
    ]);

    return {
      city,
      todayBookings,
      availableWorkers,
      completedToday,
      workersByCategory: workersByCategory.map(w => ({
        category: w.category,
        count: w._count,
      })),
    };
  },
};
