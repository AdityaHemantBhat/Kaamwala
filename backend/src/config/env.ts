import { z } from 'zod';

// Every environment variable is validated at boot. An invalid value refuses to
// start the server (fail closed) instead of silently degrading at runtime.
const envSchema = z.object({
  // Explicit NODE_ENV is REQUIRED — an unset NODE_ENV previously fell back to
  // "dev" behaviour and silently enabled development backdoors in production.
  NODE_ENV: z.enum(['development', 'test', 'production']),

  // Development/test-only bypasses (fixed OTPs, mock payments, OTP logging) are
  // gated on this flag and MUST be false in production. They are NEVER implied
  // by NODE_ENV alone.
  ENABLE_DEV_BACKDOORS: z.string().default('false'),

  PORT: z.string().default('5000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string(),
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_PHONE_NUMBER: z.string(),
  CF_APP_ID: z.string(),
  CF_SECRET_KEY: z.string(),
  CF_PAYOUT_APP_ID: z.string().optional(),
  CF_PAYOUT_SECRET_KEY: z.string().optional(),
  CF_ENV: z.string().default('SANDBOX'),
  // 32-byte key (base64) for AES-256-GCM encryption-at-rest of chat messages.
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  MESSAGE_ENCRYPTION_KEY: z.string().min(44),
  API_URL: z.string().default('http://localhost:5000'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PLATFORM_FEE_PERCENT: z.string().default('8'),
  LATE_CANCELLATION_FEE: z.string().default('50'),
}).superRefine((val, ctx) => {
  if (val.NODE_ENV !== 'production') return;

  // Production must never run against the Cashfree sandbox or without payout
  // credentials — otherwise payouts would silently go nowhere (or nowhere real).
  if (val.CF_ENV !== 'PRODUCTION') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CF_ENV'],
      message: 'CF_ENV must be PRODUCTION when NODE_ENV is production',
    });
  }
  if (!val.CF_PAYOUT_APP_ID || !val.CF_PAYOUT_SECRET_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CF_PAYOUT_APP_ID'],
      message: 'Cashfree payout credentials (CF_PAYOUT_APP_ID, CF_PAYOUT_SECRET_KEY) are required in production',
    });
  }
  if (val.ENABLE_DEV_BACKDOORS === 'true') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ENABLE_DEV_BACKDOORS'],
      message: 'ENABLE_DEV_BACKDOORS must be false in production',
    });
  }
});

export const env = envSchema.parse(process.env);

/**
 * True only when development/test bypasses are EXPLICITLY enabled via
 * ENABLE_DEV_BACKDOORS=true. This is the single gate for fixed OTPs, mock
 * payments and OTP logging — it can never be implied by NODE_ENV.
 */
export const devBackdoorsEnabled = env.ENABLE_DEV_BACKDOORS === 'true';
