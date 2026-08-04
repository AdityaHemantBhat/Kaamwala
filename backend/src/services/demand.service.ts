import { prisma } from '../config/prisma';

export const demandService = {
  async getAllCityDemands(city: string) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    const signals = await prisma.demandSignal.findMany({
      where: { city, hour, dayOfWeek },
    });

    return signals.map(s => ({
      category: s.category,
      demandScore: s.demandScore,
      surgeActive: s.surgeActive,
      surgeMultiplier: s.surgeMultiplier,
    }));
  },
};
