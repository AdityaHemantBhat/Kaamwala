import { Platform } from 'react-native';
import * as SmsRetriever from 'expo-sms-retriever';

/**
 * Android-only wrapper around the Google SMS Retriever API (via expo-sms-retriever).
 *
 * The SMS Retriever API delivers an SMS to the app ONLY when the message:
 *   1. starts with the literal prefix "<#>"   (3 bytes)
 *   2. is <= 140 bytes total
 *   3. ends with the app's 11-character signing-certificate hash
 *   4. has the one-time code as the last number in the message
 *
 * The app computes its own hash at runtime — it differs between the debug and
 * release keystores — and sends it with the send-otp request so the backend can
 * frame the SMS correctly. See backend/src/services/auth.service.ts (sendOtp).
 *
 * iOS needs none of this: the native textContentType="oneTimeCode" fills the
 * code from the SMS without any permission. On iOS, Expo Go and web there is no
 * native implementation, so every call here is a guarded no-op and the existing
 * manual-entry / system-autofill flow is preserved.
 */

const APP_HASH_PATTERN = /^[A-Za-z0-9+/]{11}$/;
const OTP_LENGTH = 6;

const isAndroid = Platform.OS === 'android';

// Cache the hash across the phone -> otp navigation and resends. It is derived
// from the signing certificate and is stable for the life of the build.
let cachedHash: string | null = null;

/**
 * The app's 11-char SMS hash, or null when unavailable (iOS / Expo Go mock /
 * malformed). Only successful results are cached so a transient failure can be
 * retried on the next call (e.g. on resend).
 */
export async function getSmsRetrieverHash(): Promise<string | null> {
  if (!isAndroid || cachedHash) return cachedHash;
  try {
    const hash = await SmsRetriever.getHash();
    if (hash && APP_HASH_PATTERN.test(hash)) {
      cachedHash = hash;
      return hash;
    }
  } catch {
    // Fall through: return null and let the caller use manual entry.
  }
  return null;
}

/**
 * Extract the one-time code from the delivered SMS.
 *
 * Google's recommended format places the OTP as the last number in the message.
 * The package's own parser grabs the FIRST number, which is fragile if the copy
 * ever gains another digit, so we re-parse the full message and take the last
 * run of exactly OTP_LENGTH digits.
 */
export function extractOtpFromSms(message: string): string | null {
  if (!message) return null;
  const matches = message.match(new RegExp(`\\d{${OTP_LENGTH}}`, 'g'));
  return matches ? matches[matches.length - 1] : null;
}

/**
 * Start listening for the OTP SMS on Android. Returns an unsubscribe function.
 *
 * The SMS Retriever API delivers only ONE message per start(), so after a resend
 * the listener must be re-armed by calling this again. Every callback is routed
 * through extractOtpFromSms so a foreign or malformed SMS is ignored. The whole
 * registration is defensive: on unsupported platforms, or if the native module
 * is unavailable, this is a no-op rather than a crash.
 */
export function subscribeToOtp(onOtp: (otp: string) => void): () => void {
  if (!isAndroid) return () => {};
  try {
    SmsRetriever.addListener(({ value }) => {
      const otp = extractOtpFromSms(value);
      if (otp) onOtp(otp);
    });
    return () => {
      try {
        SmsRetriever.removeListener();
      } catch {
        // Unregistration is best-effort.
      }
    };
  } catch {
    // Native module missing (Expo Go / web): manual entry still works.
    return () => {};
  }
}
