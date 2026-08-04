import { Request, Response, NextFunction } from 'express';

export const sanitizeStrings = (req: Request, res: Response, next: NextFunction) => {
  const sanitize = (obj: any) => {
    if (typeof obj !== 'object' || obj === null) return;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === 'string') {
          // React Native handles XSS natively. Escaping HTML entities corrupts chat messages.
          // We will just trim whitespace instead of aggressive escaping.
          obj[key] = obj[key].trim();
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    }
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);

  next();
};
