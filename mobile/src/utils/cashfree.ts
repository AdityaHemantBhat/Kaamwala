import { Platform, NativeModules } from 'react-native';
import { env } from '../config/env';

/**
 * Cashfree native checkout bridge.
 *
 * The native Cashfree SDK (`react-native-cashfree-pg-sdk`) is required for the
 * checkout to open. It is autolinked into the native project, so this module
 * will only work inside a development build / production APK — never in Expo Go.
 *
 * This module only launches the SDK checkout. It NEVER verifies or credits
 * anything client-side: every flow calls a backend verify endpoint after the
 * SDK returns, and the backend confirms the order status with Cashfree before
 * mutating any wallet/subscription state. Do not add client-side "success"
 * mutations here.
 */

interface CashfreeResult {
  orderId: string;
  status: 'SUCCESS' | 'FAILED';
  /**
   * Cashfree error code, e.g. 'action_cancelled' when the user backs out of the
   * checkout. Only present on FAILED results.
   */
  code?: string;
}

/**
 * Cashfree's code when the user exits the checkout instead of completing it.
 * This is an expected, non-destructive outcome — nothing was charged.
 */
export const PAYMENT_CANCELLED_CODE = 'action_cancelled';

/**
 * True when the SDK reported a user-initiated cancellation (backing out of the
 * checkout) rather than a real payment failure. Both paths leave the balance
 * untouched, but the UI should treat them differently: cancelling is expected
 * (reassuring info), a gateway error is not (error + retry path).
 */
export function isUserCancellation(
  result: Pick<CashfreeResult, 'status' | 'code'>,
): boolean {
  return result.status === 'FAILED' && result.code === PAYMENT_CANCELLED_CODE;
}

// Reject the checkout promise if the SDK never fires a callback (e.g. the
// activity is destroyed or an OS-level dialog swallows the result). Prevents
// a forever-pending "processing" state.
const PAYMENT_TIMEOUT_MS = 5 * 60 * 1000;

let CFPaymentGatewayService: any = null;
let CFEnvironment: any = null;
let CFSession: any = null;
let CFThemeBuilder: any = null;
let CFDropCheckoutPayment: any = null;

try {
  // Lazy require so a missing native SDK is caught, not a crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require('react-native-cashfree-pg-sdk');
  // Lazy require so a missing native SDK is caught, not a crash.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const contract = require('cashfree-pg-api-contract');

  // The SDK's JS loads even when the native module isn't linked (Expo Go or a
  // build without the module) — but then doPayment() throws the SDK's raw,
  // multi-line LINKING_ERROR at payment time. Detect the missing native module
  // up front and leave CFPaymentGatewayService null, so startCashfreePayment
  // rejects with the clean "SDK not available" message instead.
  if (!NativeModules?.CashfreePgApi) {
    console.warn('Cashfree native module not linked — a native build is required for payments.');
  } else {
    CFPaymentGatewayService = sdk.CFPaymentGatewayService;
    CFEnvironment = contract.CFEnvironment;
    CFSession = contract.CFSession;
    CFThemeBuilder = contract.CFThemeBuilder;
    CFDropCheckoutPayment = contract.CFDropCheckoutPayment;
  }
} catch {
  // Package itself not resolvable. Never silently continue, surface a clear error.
  console.warn('Cashfree SDK not available — a native build is required for payments.');
}

export async function startCashfreePayment(
  paymentSessionId: string,
  orderId: string
): Promise<CashfreeResult> {
  return new Promise<CashfreeResult>((resolve, reject) => {
    if (!CFPaymentGatewayService || !CFSession || !CFEnvironment) {
      reject(new Error('Cashfree SDK is not available in this build. Please update the app.'));
      return;
    }
    if (!paymentSessionId || !orderId) {
      reject(new Error('Invalid payment session. Please try again.'));
      return;
    }
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      reject(new Error('Payments are not supported on this platform.'));
      return;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const timeoutId = setTimeout(() => {
      CFPaymentGatewayService.removeCallback();
      settle(() => reject(new Error('Payment did not complete. Please try again.')));
    }, PAYMENT_TIMEOUT_MS);

    try {
      const cfEnv = env.CASHFREE_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
      const session = new CFSession(paymentSessionId, orderId, cfEnv);
      const theme = new CFThemeBuilder()
        .setNavigationBarBackgroundColor('#0D0D0D')
        .setNavigationBarTextColor('#FFFFFF')
        .setButtonBackgroundColor('#FF5C00')
        .setButtonTextColor('#FFFFFF')
        .setPrimaryTextColor('#212121')
        .setSecondaryTextColor('#757575')
        .build();

      const dropPayment = new CFDropCheckoutPayment(session, null, theme);

      CFPaymentGatewayService.setCallback({
        onVerify: (verifiedOrderId: string) => {
          CFPaymentGatewayService.removeCallback();
          settle(() => resolve({ orderId: verifiedOrderId || orderId, status: 'SUCCESS' }));
        },
        onError: (error: any, failedOrderId: string) => {
          CFPaymentGatewayService.removeCallback();
          // error is a CFErrorResponse with status/message/code/type. The code
          // distinguishes a user cancellation ('action_cancelled') from a real
          // gateway failure, which drives the cancel-vs-fail messaging in the UI.
          settle(() =>
            resolve({
              orderId: failedOrderId || orderId,
              status: 'FAILED',
              code: error?.code,
            }),
          );
        },
      });

      CFPaymentGatewayService.doPayment(dropPayment);
    } catch (err: any) {
      console.error('Cashfree SDK Error:', err);
      settle(() => reject(new Error(err?.message || 'Cashfree payment failed')));
    }
  });
}
