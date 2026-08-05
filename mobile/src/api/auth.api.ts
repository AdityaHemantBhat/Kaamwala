import axios from 'axios';

import { env } from '../config/env';

const api = axios.create({
  baseURL: env.API_URL,
});

export interface VerifyOtpPayload {
  phone: string;
  otp: string;
  role?: string;
  fcmToken?: string | null;
  deviceInfo?: Record<string, unknown> | null;
  /** The user's selected app language (e.g. "en") — persisted to the account. */
  preferredLang?: string;
}

export const authApi = {
  sendOtp: (phone: string, opts?: { appHash?: string | null }) =>
    api.post('/auth/send-otp', { phone, appHash: opts?.appHash }).then(res => res.data.data),
  verifyOtp: (payload: VerifyOtpPayload) => api.post('/auth/verify-otp', payload).then(res => res.data.data),
};
