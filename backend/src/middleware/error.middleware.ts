import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Client-appropriate errors (4xx with an explicit statusCode) keep their
  // message; everything else becomes a generic 500 so internals never leak.
  const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  const message = statusCode < 500 ? err.message : 'Internal Server Error';

  if (statusCode >= 500) {
    logger.error(err.message || 'Internal Server Error', { stack: err.stack });
  }

  res.status(statusCode).json({ success: false, error: message, message });
};
