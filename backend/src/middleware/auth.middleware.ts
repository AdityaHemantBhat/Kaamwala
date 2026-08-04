import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/crypto';
import { prisma } from '../config/prisma';
import { getAccountStatus } from '../utils/accountStatus';
import { touchUserActivity } from '../utils/activity';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    phone: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  let decoded: AuthRequest['user'];
  try {
    decoded = verifyAccessToken(authHeader.split(' ')[1]) as AuthRequest['user'];
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }

  // Fail closed: if the account-restriction lookup errors, deny access rather
  // than let a banned/frozen account through (the old code failed open).
  let status;
  try {
    status = await getAccountStatus(decoded!.userId);
  } catch {
    res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
    return;
  }

  if (status === null) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }

  if (status.banned) {
    // Only a USER-level temporary ban that has expired is auto-lifted. Worker-
    // profile bans (chat violations) persist until an admin acts on them.
    if (status.userBanned && !status.permanentlyBanned && status.banExpiresAt && status.banExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: decoded!.userId },
        data: { isBanned: false, banReason: null, banExpiresAt: null, bannedBy: null, bannedAt: null },
      }).catch(() => { /* non-fatal: a failing lift must not fail the request */ });
      // An active worker-profile ban must still block even after the user-level
      // ban was lifted.
      if (status.workerBanned) {
        res.status(403).json({
          success: false,
          message: 'Your account is banned.',
          banned: { reason: status.banReason, expiresAt: null, type: 'PERMANENT' },
        });
        return;
      }
    } else {
      res.status(403).json({
        success: false,
        message: 'Your account is banned.',
        banned: {
          reason: status.banReason,
          expiresAt: status.banExpiresAt,
          type: status.permanentlyBanned ? 'PERMANENT' : 'TEMPORARY',
        },
      });
      return;
    }
  }

  req.user = decoded!;
  touchUserActivity(decoded!.userId);
  next();
};
