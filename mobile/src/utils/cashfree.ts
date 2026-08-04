import { Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { env } from '../config/env';
import { t } from './i18n';

// Try importing the real Cashfree SDK. If it fails (e.g. in Expo Go), we'll gracefully fallback.
let CFPaymentGatewayService: any = null;
let CFEnvironment: any = null;
let CFSession: any = null;
let CFThemeBuilder: any = null;
let CFDropCheckoutPayment: any = null;

try {
  const sdk = require('react-native-cashfree-pg-sdk');
  const contract = require('cashfree-pg-api-contract');
  CFPaymentGatewayService = sdk.CFPaymentGatewayService;
  CFEnvironment = contract.CFEnvironment;
  CFSession = contract.CFSession;
  CFThemeBuilder = contract.CFThemeBuilder;
  CFDropCheckoutPayment = contract.CFDropCheckoutPayment;
} catch (e) {
  console.warn("Cashfree SDK not found or native module missing (expected in Expo Go).");
}

export async function startCashfreePayment(
  paymentSessionId: string,
  orderId: string
): Promise<{ orderId: string; status: 'SUCCESS' | 'FAILED', isMock?: boolean }> {
  
  return new Promise((resolve) => {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    
    if (CFPaymentGatewayService && !isExpoGo) {
      // 1. THIS IS THE REAL SDK CODE
      try {
        // Environment comes from the build config (EXPO_PUBLIC_CASHFREE_ENV) —
        // never hardcode SANDBOX here (that would route prod payments to sandbox).
        const cfEnv = env.CASHFREE_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
        const session = new CFSession(paymentSessionId, orderId, cfEnv);
        const theme = new CFThemeBuilder()
          .setNavigationBarBackgroundColor('#FF9800')
          .setNavigationBarTextColor('#FFFFFF')
          .setButtonBackgroundColor('#FF9800')
          .setButtonTextColor('#FFFFFF')
          .setPrimaryTextColor('#212121')
          .setSecondaryTextColor('#757575')
          .build();
        
        const dropPayment = new CFDropCheckoutPayment(session, null, theme);

        // Setup callbacks
        CFPaymentGatewayService.setCallback({
          onVerify: (orderID: string) => {
            CFPaymentGatewayService.removeCallback();
            resolve({ orderId: orderID, status: 'SUCCESS' });
          },
          onError: (error: any, orderID: string) => {
            CFPaymentGatewayService.removeCallback();
            resolve({ orderId: orderID, status: 'FAILED' });
          }
        });

        // Launch checkout
        CFPaymentGatewayService.doPayment(dropPayment);
      } catch (err: any) {
        console.error("Cashfree SDK Error:", err);
        
        // 2. THIS IS THE DUMMY FALLBACK FOR EXPO GO (Triggered when native linking fails)
        Alert.alert(
          t("Mock Payment"),
          t("Native Cashfree SDK failed (likely running in Expo Go).\n\nSimulate payment success?"),
          [
            {
              text: t("Fail"),
              onPress: () => resolve({ orderId, status: 'FAILED', isMock: true }),
              style: 'cancel'
            },
            {
              text: t("Success"),
              onPress: () => resolve({ orderId, status: 'SUCCESS', isMock: true })
            }
          ],
          { cancelable: false }
        );
      }
    } else {
      // 3. THIS IS THE DUMMY FALLBACK IF MODULE IS ENTIRELY MISSING
      Alert.alert(
        t("Mock Payment"),
        t("You are running in Expo Go without the Cashfree Native SDK.\n\nSimulate payment success?"),
        [
          {
            text: t("Fail"),
            onPress: () => resolve({ orderId, status: 'FAILED', isMock: true }),
            style: 'cancel'
          },
          {
            text: t("Success"),
            onPress: () => resolve({ orderId, status: 'SUCCESS', isMock: true })
          }
        ],
        { cancelable: false }
      );
    }
  });
}
