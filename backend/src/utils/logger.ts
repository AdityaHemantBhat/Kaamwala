import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Production: single-line structured JSON to stdout (log shippers/containers
 * consume stdout; never rely on files in prod).
 * Development: human-readable console + bounded, rotating file transports.
 */
export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

if (!isProd) {
  logger.add(
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
      tailable: true,
    }),
  );
  logger.add(
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  );
}
