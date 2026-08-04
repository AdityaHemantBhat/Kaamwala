import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // SUPER_ADMIN is a superset of ADMIN — it can access anything an ADMIN can
    // (plus the dedicated super-admin routes). Exact match OR the ADMIN-superset.
    const roleMatches = req.user.role === role || (role === 'ADMIN' && req.user.role === 'SUPER_ADMIN');

    if (!roleMatches) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
