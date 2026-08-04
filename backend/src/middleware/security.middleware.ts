import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { sendError } from '../utils/response';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_SIZE = 10_000;

// In-process TTL cache so the hot path is not a DB query on every request.
// Keyed by IP → { banned, expiresAt }. Bans apply within ~1 min; unbanning is
// also reflected within ~1 min.
const ipBanCache = new Map<string, { banned: boolean; expiresAt: Date | null; checkedAt: number }>();

function cacheIp(ip: string, banned: boolean, expiresAt: Date | null): void {
  if (ipBanCache.size >= MAX_CACHE_SIZE) {
    ipBanCache.delete(ipBanCache.keys().next().value as string);
  }
  ipBanCache.set(ip, { banned, expiresAt, checkedAt: Date.now() });
}

export const ipBanMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress;

    if (!ip) {
      return next();
    }

    const cached = ipBanCache.get(ip);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
      if (cached.banned) {
        if (cached.expiresAt && cached.expiresAt < new Date()) {
          ipBanCache.delete(ip); // expired — re-query below to clean the row
        } else {
          return sendError(res, 403, 'Your IP address has been banned from accessing this service.');
        }
      } else {
        return next();
      }
    }

    const bannedIp = await prisma.bannedIP.findUnique({ where: { ip } });

    if (bannedIp) {
      // Check if temporary ban expired
      if (bannedIp.expiresAt && bannedIp.expiresAt < new Date()) {
        await prisma.bannedIP.delete({ where: { ip } });
        ipBanCache.delete(ip);
        return next();
      }
      cacheIp(ip, true, bannedIp.expiresAt);
      return sendError(res, 403, 'Your IP address has been banned from accessing this service.');
    }

    cacheIp(ip, false, null);
    next();
  } catch (error) {
    next();
  }
};
