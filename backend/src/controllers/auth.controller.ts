import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { sendResponse, sendError } from '../utils/response';
import { prisma } from '../config/prisma';
import { pricingService } from '../services/pricing.service';
import { getClientIp, getUserAgent } from '../utils/audit';

export const authController = {
  sendOtp: async (req: Request, res: Response) => {
    try {
      // `appHash` is the app's 11-char SMS Retriever hash (Android). When present
      // and valid, authService frames the SMS so the Retriever API can deliver it.
      const { phone, appHash } = req.body;
      const result = await authService.sendOtp(phone, appHash, { ip: getClientIp(req) });
      sendResponse(res, 200, result);
    } catch (error: any) {
      sendError(res, 400, error.message);
    }
  },

  verifyOtp: async (req: Request, res: Response) => {
    try {
      const { phone, otp, role, fcmToken, deviceInfo, preferredLang } = req.body;
      const data = await authService.verifyOtp(phone, otp, role, {
        fcmToken,
        deviceInfo,
        preferredLang,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      sendResponse(res, 200, data);
    } catch (error: any) {
      sendError(res, 401, error.message);
    }
  },

  refresh: async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshTokens(refreshToken, {
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      sendResponse(res, 200, tokens);
    } catch (error: any) {
      sendError(res, 401, error.message);
    }
  },

  logout: async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.logout(refreshToken);
      sendResponse(res, 200, result);
    } catch (error: any) {
      sendError(res, 400, error.message);
    }
  },

  updateProfile: async (req: any, res: Response) => {
    try {
      // `role` is intentionally NOT accepted here — it would let any user
      // self-promote to ADMIN. Role changes happen only server-side via the
      // verified-OTP login flow (auth.service.verifyOtp).
      const { name, photoUrl, avatarUrl: incomingAvatar, preferredLang, category, city, state, experienceYears, hourlyRate, upiId, bankAccountNumber, bankIfsc, bio, weeklyEarningsGoal, skills, languages, subCategories, workPhotos, pincode, introVideoUrl } = req.body;

      const userData: any = {};
      if (name !== undefined) userData.name = name;
      if (photoUrl !== undefined) userData.avatarUrl = photoUrl;
      if (incomingAvatar !== undefined) userData.avatarUrl = incomingAvatar;
      // Keep the account language in sync whenever the user changes it later.
      if (preferredLang !== undefined && typeof preferredLang === 'string' && preferredLang.length <= 10) {
        userData.preferredLang = preferredLang;
      }

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: userData,
        select: { id: true, name: true, phone: true, role: true, avatarUrl: true },
      });

      if (user.role === 'WORKER') {
        const workerData: any = {};
        if (category !== undefined) workerData.category = category;
        if (city !== undefined) workerData.city = city;
        if (state !== undefined) workerData.state = state;
        if (experienceYears !== undefined) workerData.experienceYears = Number(experienceYears);
        if (hourlyRate !== undefined) workerData.hourlyRate = Number(hourlyRate);
        if (upiId !== undefined) workerData.upiId = upiId;
        if (bankAccountNumber !== undefined) workerData.bankAccountNumber = bankAccountNumber;
        if (bankIfsc !== undefined) workerData.bankIfsc = bankIfsc;
        if (bio !== undefined) workerData.bio = bio;
        if (weeklyEarningsGoal !== undefined) workerData.weeklyEarningsGoal = Number(weeklyEarningsGoal);
        // Designed-but-dead fields — now writable through the same profile
        // endpoint so the mobile UI can manage them (sanitized before persist).
        if (skills !== undefined) {
          workerData.skills = Array.isArray(skills)
            ? skills.filter((s: any) => typeof s === 'string' && s.trim()).map((s: any) => s.trim()).slice(0, 20)
            : [];
        }
        if (languages !== undefined) {
          const langList = Array.isArray(languages)
            ? languages.filter((l: any) => typeof l === 'string' && l.trim()).map((l: any) => l.trim()).slice(0, 5)
            : [];
          workerData.languages = langList.length ? langList : ['en'];
        }
        if (subCategories !== undefined && Array.isArray(subCategories)) {
          workerData.subCategories = subCategories.filter((s: any) => typeof s === 'string').slice(0, 10);
        }
        if (workPhotos !== undefined && Array.isArray(workPhotos)) {
          workerData.workPhotos = workPhotos
            .filter((s: any) => typeof s === 'string' && s.startsWith('https://'))
            .slice(0, 6);
        }
        if (pincode !== undefined) {
          const pc = pincode ? String(pincode).trim().slice(0, 10) : '';
          workerData.pincode = pc || null;
        }
        if (introVideoUrl !== undefined) {
          workerData.introVideoUrl = introVideoUrl ? String(introVideoUrl).slice(0, 500) : null;
        }

        // Platform minimum-floor validation for worker rates — never trust frontend.
        // The floor is market-derived per the worker's city; see pricingService.getMinimumFloor.
        if (workerData.hourlyRate !== undefined) {
          const existing = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
          const rateCategory = workerData.category || existing?.category;
          const zone = workerData.city || existing?.city || null;
          const floorOk = await pricingService.validateMinimumFloor(rateCategory as any, workerData.hourlyRate, 'PER_HOUR', zone);
          if (!floorOk) {
            const min = await pricingService.getMinimumFloor(rateCategory as any, 'PER_HOUR', zone);
            return sendError(res, 400, `Hourly rate cannot be below the platform minimum of ₹${min}/hr`);
          }
        }

        if (Object.keys(workerData).length > 0) {
          await prisma.workerProfile.upsert({
            where: { userId: user.id },
            update: workerData,
            create: { userId: user.id, category: 'PLUMBER', ...workerData },
          });
        }
      }

      sendResponse(res, 200, user, 'Profile updated');
    } catch (error: any) {
      sendError(res, 400, error.message);
    }
  }
};
