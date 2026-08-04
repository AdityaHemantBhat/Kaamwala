import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { pricingService } from '../services/pricing.service';
import { AuthRequest } from '../middleware/auth.middleware';

// Services a worker lists on their public profile and that customers can book
// directly. Only the owning worker may manage them; the platform minimum-floor
// guard is enforced server-side so a worker can never undercut the
// market with a sub-minimum price.
// The floor is the per-hour minimum, exactly like the worker's own rate
// validation in auth.controller — a service billed by visit/hour/day must pay
// at least an hour of the category floor. 'sqft' is per-area (naturally small)
// so it carries no time-based floor.
const SERVICE_UNIT_FLOOR: Record<string, string> = { hour: 'PER_HOUR', visit: 'PER_HOUR', day: 'PER_HOUR' };

/**
 * Returns the minimum price for the service, or null when it passes.
 * The floor is market-derived (p15 of recent observations in the worker's city,
 * falling back to the configured absolute floor) — see pricingService.getMinimumFloor.
 */
async function servicePriceFloor(category: string, price: number, unit: string, city?: string | null): Promise<number | null> {
  const floorUnit = SERVICE_UNIT_FLOOR[unit];
  if (!floorUnit) return null;
  const floor = await pricingService.getMinimumFloor(category as any, floorUnit, city);
  return price >= floor ? null : floor;
}

const assertOwnService = async (serviceId: string, userId: string) => {
  const service = await prisma.workerService.findUnique({
    where: { id: serviceId },
    include: { workerProfile: { select: { userId: true, category: true, city: true } } },
  });
  if (!service) throw new Error('Service not found');
  if (service.workerProfile.userId !== userId) {
    const err: any = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return service;
};

export const workerServicesController = {
  // List the authenticated worker's own services (for the profile manager).
  listMyServices: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!workerProfile) return sendResponse(res, 200, []);
      const services = await prisma.workerService.findMany({
        where: { workerProfileId: workerProfile.id },
        orderBy: { createdAt: 'asc' },
      });
      sendResponse(res, 200, services);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  createService: async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, basePrice, priceUnit, isActive } = req.body;
      if (!name || !String(name).trim()) return sendError(res, 400, 'Service name is required');
      const price = Number(basePrice);
      if (!price || price < 1) return sendError(res, 400, 'Enter a valid price');

      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true, category: true, city: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const unit = priceUnit || 'visit';
      const min = await servicePriceFloor(workerProfile.category, price, unit, workerProfile.city);
      if (min !== null) return sendError(res, 400, `Service price cannot be below the platform minimum of ₹${min}`);

      const service = await prisma.workerService.create({
        data: {
          workerProfileId: workerProfile.id,
          name: String(name).trim(),
          description: description ? String(description).trim() : '',
          basePrice: price,
          priceUnit: unit,
          isActive: isActive !== false,
        },
      });
      sendResponse(res, 201, service, 'Service added');
    } catch (e: any) {
      sendError(res, 400, e.message);
    }
  },

  updateService: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, basePrice, priceUnit, isActive } = req.body;

      const existing = await assertOwnService(id, req.user!.userId);
      const data: any = {};

      if (name !== undefined) {
        if (!String(name).trim()) return sendError(res, 400, 'Service name is required');
        data.name = String(name).trim();
      }
      if (description !== undefined) data.description = String(description).trim();
      if (priceUnit !== undefined) data.priceUnit = priceUnit;
      if (isActive !== undefined) data.isActive = !!isActive;
      if (basePrice !== undefined) {
        const price = Number(basePrice);
        if (!price || price < 1) return sendError(res, 400, 'Enter a valid price');
        const unit = data.priceUnit || existing.priceUnit;
        const min = await servicePriceFloor(existing.workerProfile.category, price, unit, existing.workerProfile.city);
        if (min !== null) return sendError(res, 400, `Service price cannot be below the platform minimum of ₹${min}`);
        data.basePrice = price;
      }

      if (Object.keys(data).length === 0) return sendError(res, 400, 'Nothing to update');

      const service = await prisma.workerService.update({ where: { id }, data });
      sendResponse(res, 200, service, 'Service updated');
    } catch (e: any) {
      sendError(res, e.status || 400, e.message);
    }
  },

  deleteService: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await assertOwnService(id, req.user!.userId);
      await prisma.workerService.delete({ where: { id } });
      sendResponse(res, 200, { success: true }, 'Service removed');
    } catch (e: any) {
      sendError(res, e.status || 400, e.message);
    }
  },
};
