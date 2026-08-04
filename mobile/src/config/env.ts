import Constants from 'expo-constants';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.string().url().default('http://localhost:5000/api/v1'),
  // ⚠️ Geoapify tile API key. NO key is hardcoded in the bundle — it is read
  // strictly from the build environment. A client-side map key is inherently
  // visible in the published bundle, so set EXPO_PUBLIC_GEOAPIFY_KEY in your
  // .env (dev) / EAS build secret (production), rotate it periodically, and
  // prefer proxying tile requests through the backend in production.
  // Missing/empty is intentionally tolerated (map tiles degrade, app still
  // boots) rather than crashing the whole bundle.
  GEOAPIFY_KEY: z.string().default(''),
  // Cashfree SDK environment — "PRODUCTION" for release builds. The SDK is
  // hardcoded to SANDBOX in the past, which would have routed real payments to
  // the sandbox in production. This must come from the build env.
  CASHFREE_ENV: z.enum(['SANDBOX', 'PRODUCTION']).default('SANDBOX'),
  // Merchant UPI ID and display name used in the Quick Pay deep-links.
  // Set EXPO_PUBLIC_MERCHANT_UPI_ID and EXPO_PUBLIC_MERCHANT_NAME in .env
  // (dev) or as EAS build secrets (production).
  MERCHANT_UPI_ID: z.string().default('kaamwala@upi'),
  MERCHANT_NAME: z.string().default('KaamWala'),
});

// Automatically detect the local IP address if running in Expo dev mode
const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(':')[0] || '10.0.2.2';

const parsedEnv = envSchema.safeParse({
  API_URL: process.env.EXPO_PUBLIC_API_URL || `http://${localhost}:5000/api/v1`,
  GEOAPIFY_KEY: process.env.EXPO_PUBLIC_GEOAPIFY_KEY || '',
  CASHFREE_ENV: (process.env.EXPO_PUBLIC_CASHFREE_ENV || 'SANDBOX') as 'SANDBOX' | 'PRODUCTION',
  MERCHANT_UPI_ID: process.env.EXPO_PUBLIC_MERCHANT_UPI_ID || 'kaamwala@upi',
  MERCHANT_NAME: process.env.EXPO_PUBLIC_MERCHANT_NAME || 'KaamWala',
});

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;
