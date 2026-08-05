import { env, devBackdoorsEnabled } from '../config/env';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { signAccessToken, durationToMs } from '../utils/crypto';
import { sanitizeDeviceInfo } from '../utils/device-info';
import { logger } from '../utils/logger';

const REFRESH_TOKEN_TTL_MS = durationToMs(env.JWT_REFRESH_EXPIRES_IN) || 7 * 24 * 60 * 60 * 1000;

// Google SMS Retriever API: an SMS is delivered to the app ONLY when it starts
// with the literal "<#>", is <= 140 bytes, and ends with the app's 11-character
// signing-certificate hash. The mobile app computes that hash at runtime (getHash
// — it differs between debug/release keystores) and sends it with the send-otp
// request, so we can frame the message here. When no valid hash is present (iOS,
// web, Expo Go, other clients) we keep the plain human-readable message, which
// iOS's native oneTimeCode autofill parses fine on its own.
const SMS_APP_HASH_PATTERN = /^[A-Za-z0-9+/]{11}$/;

function buildOtpMessage(otp: string, appHash?: string | null): string {
  // The hash is an injection control as much as a format check: only a trimmed,
  // exactly-11-char base64 value is ever echoed into the SMS body, so a malicious
  // client cannot smuggle extra text (e.g. a newline + content) through the
  // alphanumeric sender ID.
  const sanitized = appHash?.trim();
  if (sanitized && SMS_APP_HASH_PATTERN.test(sanitized)) {
    // Google SMS Retriever format: "<#>" prefix, "code is <otp>" wording (which
    // iOS oneTimeCode and Android system autofill both look for), and the hash
    // suffix on its own line. 53 bytes — a single SMS segment, well under 140.
    return `<#> KaamWala verification code is ${otp}\n\n${sanitized}`;
  }
  return `[KaamWala] Your verification code is ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
}

// In-memory OTP fallback when Redis is unavailable
const memoryOtps = new Map<string, { otp: string; expiresAt: number }>();
const memoryAttempts = new Map<string, number>();

// Twilio is lazily loaded on first SMS so it is not part of the startup hot
// path (the SDK pulls a large dependency tree). First send pays a one-time cost.
let twilioClient: import('twilio').Twilio | null = null;
function getTwilio(): import('twilio').Twilio {
  if (!twilioClient) {
    const { Twilio } = require('twilio');
    twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient!;
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export const authService = {
  async sendOtp(phone: string, appHash?: string | null, opts: { ip?: string | null } = {}) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60000);

    try {
      await redis.set(`otp:${phone}`, otp, { EX: 300 });
    } catch (err) {
      memoryOtps.set(phone, { otp, expiresAt: Date.now() + 300000 });
    }

    // OTPs are logged ONLY when dev backdoors are explicitly enabled — never in
    // production and never implied by NODE_ENV.
    if (devBackdoorsEnabled) {
      logger.info(`[DEV BACKDOOR] Generated OTP for ${phone}: ${otp}`);
    }

    const body = buildOtpMessage(otp, appHash);

    try {
      // Best Practice: Attempt to send using an Alphanumeric Sender ID ('KAAMWALA')
      // so the notification shows the brand name instead of a random number.
      const client = getTwilio();
      
      logger.info(`[OTP] Attempting to send OTP to ${phone}`, { 
        timestamp: new Date().toISOString(),
        senderType: 'alphanumeric'
      });

      await client.messages.create({
        body,
        from: 'KAAMWALA',
        to: phone,
      }).then(msg => {
        logger.info(`[OTP] Successfully sent via alphanumeric sender to ${phone}`, { 
          messageSid: msg.sid,
          status: msg.status,
          timestamp: new Date().toISOString()
        });
      }).catch(async (err) => {
        // Fallback: If Alphanumeric Sender IDs are not supported by the account (e.g. Trial accounts)
        // or the destination country, fallback to the standard Twilio Phone Number.
        const isTwilioTrialError = err.code === 21301 || err.message?.includes('Trial') || err.message?.includes('not authorized');
        
        logger.warn(`[OTP] Alphanumeric sender failed for ${phone}`, { 
          errorCode: err.code,
          errorMessage: err.message,
          isTwilioTrialIssue: isTwilioTrialError,
          timestamp: new Date().toISOString()
        });

        if (isTwilioTrialError) {
          logger.warn(`[OTP] ⚠️  Twilio Trial Account detected! Only verified phone numbers can receive SMS. Add ${phone} to Verified Caller IDs in Twilio Console or upgrade to Production account.`);
        }

        return await client.messages.create({
          body,
          from: env.TWILIO_PHONE_NUMBER,
          to: phone,
        }).then(msg => {
          logger.info(`[OTP] Successfully sent via fallback number to ${phone}`, { 
            messageSid: msg.sid,
            status: msg.status,
            timestamp: new Date().toISOString()
          });
        });
      });
    } catch (e: any) {
      // The failure message never contains the OTP; log it fully.
      const twilioErrorCode = e.code;
      const twilioErrorMsg = e.message;
      const isTwilioTrialError = twilioErrorCode === 21301;

      logger.error(`[OTP] Failed to send OTP to ${phone}`, {
        errorCode: twilioErrorCode,
        errorMessage: twilioErrorMsg,
        isTwilioTrialIssue: isTwilioTrialError,
        timestamp: new Date().toISOString()
      });

      if (isTwilioTrialError) {
        logger.error(`[OTP] 🔴 TWILIO TRIAL ACCOUNT ISSUE: Account is in Trial mode and ${phone} is not a verified number. Solutions:
          1. Upgrade to Production Twilio account (https://console.twilio.com/account/upgrade)
          2. OR manually add this number to Verified Caller IDs in Twilio Console
          3. OR use dev backdoor (ENABLE_DEV_BACKDOORS=true for testing)`);
      }
    }

    await prisma.otpAuditLog.create({
      data: { phone, action: 'SEND_OTP', success: true, ip: opts.ip || null }
    });

    return { phone };
  },

  async verifyOtp(
    phone: string,
    otp: string,
    role?: string,
    opts: { fcmToken?: string | null; deviceInfo?: unknown; preferredLang?: string | null; ip?: string | null; userAgent?: string | null } = {},
  ) {
    const auditIp = opts.ip || null;
    let cachedOtp = null;
    try {
      cachedOtp = await redis.get(`otp:${phone}`);
    } catch (err) {
      const mem = memoryOtps.get(phone);
      if (mem && mem.expiresAt > Date.now()) cachedOtp = mem.otp;
      else memoryOtps.delete(phone);
    }

    if (!cachedOtp) {
      await prisma.otpAuditLog.create({ data: { phone, action: 'VERIFY_OTP_EXPIRED', success: false, ip: auditIp }});
      await this.recordLoginAttempt({ phone, ip: auditIp, userAgent: opts.userAgent, success: false, failReason: 'OTP expired' });
      throw new Error('OTP expired or not sent');
    }

    // Check attempt counter in Redis
    const attemptsKey = `otp_attempts:${phone}`;
    let attempts = 0;
    try {
      attempts = parseInt(await redis.get(attemptsKey) || '0', 10);
    } catch (err) {
      attempts = memoryAttempts.get(phone) || 0;
    }

    if (attempts >= 3) {
      await prisma.otpAuditLog.create({ data: { phone, action: 'VERIFY_OTP_LOCKED', success: false, ip: auditIp }});
      await this.recordLoginAttempt({ phone, ip: auditIp, userAgent: opts.userAgent, success: false, failReason: 'OTP locked' });
      throw new Error('OTP locked — too many attempts');
    }

    // Dev-only backdoor so local testing works without Twilio. Only active when
    // ENABLE_DEV_BACKDOORS=true is explicitly set — never in production.
    const devOtpBackdoor = devBackdoorsEnabled && otp === '123456';
    if (cachedOtp !== otp && !devOtpBackdoor) {
      try { await redis.set(attemptsKey, (attempts + 1).toString(), { EX: 900 }); } catch (err) {
        memoryAttempts.set(phone, attempts + 1);
      }
      await prisma.otpAuditLog.create({ data: { phone, action: 'VERIFY_OTP_INVALID', success: false, ip: auditIp }});
      await this.recordLoginAttempt({ phone, ip: auditIp, userAgent: opts.userAgent, success: false, failReason: 'Invalid OTP' });
      throw new Error('Invalid OTP');
    }

    let targetRole = role === 'WORKER' ? 'WORKER' : 'CUSTOMER';
    let user = await prisma.user.findUnique({
      where: { phone },
      include: { workerProfile: true, customerProfile: true }
    });
    const isNewUser = !user;

    // Preserve privileged roles — a caller-supplied `role` must NEVER downgrade
    // an ADMIN or SUPER_ADMIN account to a lesser role.
    const PRIVILEGED_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);
    if (user && PRIVILEGED_ROLES.has(user.role)) targetRole = user.role;

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: targetRole === 'WORKER' ? 'Worker Partner' : targetRole === 'ADMIN' ? 'Admin' : 'Customer',
          referralCode: `KW-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          role: targetRole as any,
          preferredLang: opts.preferredLang || 'en',
          customerProfile: targetRole !== 'WORKER' ? { create: { totalBookings: 0, totalSpent: 0, loyaltyPoints: 0 } } : undefined,
          ...(targetRole === 'WORKER' && {
            workerProfile: {
              create: {
                category: 'PLUMBER',
                hourlyRate: 300,
                isAvailable: true,
                isOnline: true,
              }
            }
          })
        },
        include: { workerProfile: true, customerProfile: true }
      });
    } else if (role && user.role !== targetRole && !PRIVILEGED_ROLES.has(user.role)) {
      user = await prisma.user.update({
        where: { phone },
        data: {
          role: targetRole as any,
          preferredLang: opts.preferredLang || user.preferredLang || 'en',
          ...(!user.workerProfile && targetRole === 'WORKER' && {
            workerProfile: {
              create: {
                category: 'PLUMBER',
                hourlyRate: 300,
                isAvailable: true,
                isOnline: true,
              }
            }
          })
        },
        include: { workerProfile: true, customerProfile: true }
      });
    }

    try { await redis.del(`otp:${phone}`); } catch (err) {}
    memoryOtps.delete(phone);
    await prisma.otpAuditLog.create({ data: { phone, action: 'VERIFY_OTP_SUCCESS', success: true, ip: auditIp }});

    // Record this login in real time. loginCount is incremented atomically so
    // concurrent logins can't lose counts; device enrichment is best-effort.
    // preferredLang is stored whenever the client sends it (never overwriting a
    // previously saved language with null).
    const safeDeviceInfo = sanitizeDeviceInfo(opts.deviceInfo);
    user = await prisma.user.update({
      where: { id: user!.id },
      data: {
        loginCount: { increment: 1 },
        lastActiveAt: new Date(),
        ...(opts.preferredLang ? { preferredLang: opts.preferredLang } : {}),
        ...(opts.fcmToken ? { fcmToken: opts.fcmToken } : {}),
        ...(safeDeviceInfo ? { deviceInfo: safeDeviceInfo } : {}),
      },
      include: { workerProfile: true, customerProfile: true },
    });

    await this.recordLoginAttempt({ userId: user.id, phone, ip: auditIp, userAgent: opts.userAgent, success: true });

    const accessToken = signAccessToken({ userId: user.id, role: user.role, phone: user.phone });
    const rawString = generateRefreshToken();
    const rawRefreshToken = `${user.id}:${rawString}`;
    const tokenHash = await bcrypt.hash(rawString, 10);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: auditIp,
        userAgent: opts.userAgent || null,
        lastUsedAt: new Date(),
      }
    });

    return { user, accessToken, refreshToken: rawRefreshToken, isNewUser };
  },

  async refreshTokens(rawToken: string, opts: { ip?: string | null; userAgent?: string | null } = {}) {
    // First, find if the token exists (this requires fetching all for user or scanning,
    // since we only have the hash in DB, but normally we would need the userId or token ID to look it up.
    // To make it lookup-able, we can prefix the rawToken with the token ID or user ID: "userId.rawToken"
    // Let's assume rawToken is "userId:rawString"
    const parts = rawToken.split(':');
    if (parts.length !== 2) throw new Error('Invalid token format');
    const [userId, rawString] = parts;

    const userTokens = await prisma.refreshToken.findMany({ where: { userId } });
    
    let matchedToken = null;
    for (const t of userTokens) {
      if (await bcrypt.compare(rawString, t.tokenHash)) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      // Reuse detection logic: if they sent a valid format but no matching active token,
      // it might mean they are trying to reuse an old token.
      // Revoke all tokens for user just in case.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      throw new Error('Invalid or expired refresh token');
    }

    if (matchedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: matchedToken.id } });
      throw new Error('Refresh token expired');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Delete old — use deleteMany to avoid race condition crash
    await prisma.refreshToken.deleteMany({ where: { id: matchedToken.id } });

    // Create new — stamp the request context (IP + user-agent) and the last-use
    // time so the token lifecycle is auditable.
    const accessToken = signAccessToken({ userId: user.id, role: user.role, phone: user.phone });
    const newRawString = generateRefreshToken();
    const newRawToken = `${user.id}:${newRawString}`;
    const tokenHash = await bcrypt.hash(newRawString, 10);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: opts.ip || null,
        userAgent: opts.userAgent || null,
        lastUsedAt: new Date(),
      }
    });

    return { accessToken, refreshToken: newRawToken };
  },

  async logout(rawToken: string) {
    const parts = rawToken.split(':');
    if (parts.length !== 2) return { success: true };
    const [userId, rawString] = parts;

    const userTokens = await prisma.refreshToken.findMany({ where: { userId } });
    for (const t of userTokens) {
      if (await bcrypt.compare(rawString, t.tokenHash)) {
        await prisma.refreshToken.delete({ where: { id: t.id } });
        break;
      }
    }
    return { success: true };
  },

  /**
   * Persist a login success/failure for the audit trail (admin "login history"
   * reads this table). Deliberately best-effort — a logging failure must never
   * block the actual login. `ip` is required by the schema, so fall back to a
   * sentinel when the request had no resolvable IP.
   */
  async recordLoginAttempt(params: {
    userId?: string;
    phone: string;
    ip?: string | null;
    userAgent?: string | null;
    success: boolean;
    failReason?: string;
  }) {
    try {
      await prisma.loginAttempt.create({
        data: {
          userId: params.userId || null,
          phone: params.phone,
          ip: params.ip || 'unknown',
          userAgent: params.userAgent || null,
          success: params.success,
          failReason: params.failReason || null,
        },
      });
    } catch (e) {
      logger.warn('Failed to record login attempt', { error: (e as Error).message });
    }
  },
};
