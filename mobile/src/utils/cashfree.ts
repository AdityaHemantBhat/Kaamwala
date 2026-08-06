import { Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { env } from '../config/env';
import { t } from './i18n';

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
  console.warn('Cashfree SDK not available — a development build is required for payments.');
}

export async function startCashfreePayment(
  paymentSessionId: string,
  orderId: string
): Promise<{ orderId: string; status: 'SUCCESS' | 'FAILED' }> {
  return new Promise((resolve, reject) => {
    if (!CFPaymentGatewayService) {
      reject(new Error('Cashfree SDK not available. Please use a development build to process payments.'));
      return;
    }

    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (isExpoGo) {
      reject(new Error('Cashfree payments require a development build. Please build the app with EAS.'));
      return;
    }

    try {
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

      CFPaymentGatewayService.doPayment(dropPayment);
    } catch (err: any) {
      console.error('Cashfree SDK Error:', err);
      reject(new Error(err?.message || 'Cashfree payment failed'));
    }
  });
}