import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface PayoutOptions {
  transferId: string;
  amount: number;
  upiId: string;
  name: string;
  /** Real beneficiary phone — Cashfree requires it and rejects shared/fake numbers. */
  phone?: string;
  email?: string;
  /** Stable per-worker key so the beneficiary is created once and reused. */
  beneficiaryKey?: string;
}

export const payoutService = {
  async processPayout(opts: PayoutOptions) {
    const { transferId, amount, upiId, name, phone, email, beneficiaryKey } = opts;

    // NEVER silently mock a payout in production. Boot-time env validation
    // (config/env.ts) already refuses to start without payout credentials, so
    // this branch is only reachable in dev/test — but guard it anyway so a
    // misconfiguration can never turn into a fake "paid" ledger row.
    if (!env.CF_PAYOUT_APP_ID || !env.CF_PAYOUT_SECRET_KEY) {
      if (env.NODE_ENV === 'production') {
        throw new Error('Payout credentials are not configured');
      }
      logger.warn(`[MOCK PAYOUT] (dev only) Transferred Rs.${amount} to UPI: ${upiId} for ${name}`);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { success: true, referenceId: `mock_ref_${Date.now()}` };
    }

    try {
      const baseUrl = env.CF_ENV === 'PRODUCTION'
        ? 'https://payout-api.cashfree.com/payout/v1.2'
        : 'https://payout-gamma.cashfree.com/payout/v1.2';

      // 1. Authorize
      const authRes = await axios.post(`${baseUrl}/authorize`, {}, {
        headers: {
          'X-Client-Id': env.CF_PAYOUT_APP_ID,
          'X-Client-Secret': env.CF_PAYOUT_SECRET_KEY
        }
      });

      const token = authRes.data?.data?.token;
      if (!token) throw new Error('Failed to obtain Cashfree Payout Token');

      // 2. Add Beneficiary (reuse a stable per-worker beneId; ignore 409).
      const beneId = `bene_${beneficiaryKey || transferId}`;
      try {
        await axios.post(`${baseUrl}/addBeneficiary`, {
            beneId,
            name: name || 'Worker Partner',
            email: email || 'worker@kaamwala.app',
            phone: phone || '9999999999',
            vpa: upiId,
            address1: 'India'
          },
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      } catch (e: any) {
        if (e.response?.data?.subCode !== '409') throw e; // 409 means already exists
      }

      // 3. Request Transfer — transferId is the withdrawal id (idempotent).
      const transferRes = await axios.post(`${baseUrl}/requestTransfer`, {
          beneId,
          amount,
          transferId,
          transferMode: 'upi',
          remarks: 'KaamWalla Payout'
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (transferRes.data?.status === 'SUCCESS') {
        return { success: true, referenceId: transferRes.data?.data?.referenceId };
      } else {
        throw new Error(transferRes.data?.message || 'Transfer failed');
      }

    } catch (error: any) {
      logger.error('Cashfree Payout Failed:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Payment Gateway Payout Failed');
    }
  }
};
