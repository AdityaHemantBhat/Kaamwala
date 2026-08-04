import { Response } from 'express';
import { logger } from './logger';

export const sendResponse = (res: Response, statusCode: number, data: any, message: string = 'Success') => {
  res.status(statusCode).json({ success: statusCode < 400, message, data });
};

export const sendError = (res: Response, statusCode: number, message: string) => {
  // Both keys are emitted so legacy clients reading `.error` and newer clients
  // reading `.message` both work — the API contract stays additive.
  //
  // 5xx responses must never leak internals (stack traces, SQL, file paths).
  // The real message is logged server-side; the client gets a generic one.
  if (statusCode >= 500) {
    logger.error(`[5xx] ${message}`);
    message = 'Internal Server Error';
  }
  res.status(statusCode).json({ success: false, error: message, message });
};
