import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const addressController = {
  getAddresses: async (req: AuthRequest, res: Response) => {
    try {
      const addresses = await prisma.address.findMany({
        where: { userId: req.user!.userId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
      });
      sendResponse(res, 200, addresses);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  createAddress: async (req: AuthRequest, res: Response) => {
    try {
      const data = req.body;
      const makeDefault = data.isDefault === true;

      // A service address is worthless without coordinates — a worker navigates
      // by lat/lng, never by the address string. Reject (0,0) / missing fixes
      // instead of silently storing a pin in the ocean.
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return sendError(res, 400, 'Address location coordinates are required. Please set your location.');
      }

      if (makeDefault) {
        await prisma.address.updateMany({
          where: { userId: req.user!.userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // Whitelist fields — never spread req.body (mass assignment).
      const address = await prisma.address.create({
        data: {
          label: data.label ?? 'Home',
          line1: data.line1,
          line2: data.line2 ?? null,
          landmark: data.landmark ?? null,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          latitude,
          longitude,
          isDefault: makeDefault,
          userId: req.user!.userId,
        },
      });

      sendResponse(res, 201, address, 'Address added');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  deleteAddress: async (req: AuthRequest, res: Response) => {
    try {
      const address = await prisma.address.findFirst({
        where: { id: req.params.id, userId: req.user!.userId, isDeleted: false },
      });

      if (!address) {
        return sendError(res, 404, 'Address not found');
      }

      await prisma.address.update({ where: { id: req.params.id }, data: { isDeleted: true, isDefault: false } });
      sendResponse(res, 200, null, 'Address deleted');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  setDefault: async (req: AuthRequest, res: Response) => {
    try {
      const address = await prisma.address.findFirst({
        where: { id: req.params.id, userId: req.user!.userId, isDeleted: false },
      });

      if (!address) {
        return sendError(res, 404, 'Address not found');
      }

      await prisma.address.updateMany({
        where: { userId: req.user!.userId, isDefault: true },
        data: { isDefault: false },
      });

      const updated = await prisma.address.update({
        where: { id: req.params.id },
        data: { isDefault: true },
      });

      sendResponse(res, 200, updated, 'Default address updated');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
