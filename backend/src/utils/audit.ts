import { Request } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';

const MAX_IP_LENGTH = 45; // IPv6 max length
const MAX_UA_LENGTH = 255;

export function getClientIp(req: { ip?: any; headers?: any; socket?: any } | null | undefined): string | null {
  if (!req) return null;
  // Behind a proxy / tunnel (ngrok, nginx, ELB) the real client IP is the first
  // entry of x-forwarded-for. Fall back to the socket address otherwise.
  const forwarded = req.headers?.['x-forwarded-for'];
  const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null;
  const ip = forwardedIp || req.ip || req.socket?.remoteAddress || null;
  return ip ? String(ip).slice(0, MAX_IP_LENGTH) : null;
}

export function getUserAgent(req: { headers?: any } | null | undefined): string | null {
  if (!req) return null;
  const ua = req.headers?.['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, MAX_UA_LENGTH) : null;
}

/**
 * Single entry point for audit rows. Always stamps the client IP + user agent so
 * the audit trail records who acted and from where. Works with both `prisma`
 * and a transaction client (`tx`) so call sites can't forget the metadata.
 */
export async function createAuditLog(
  client: PrismaClient | Prisma.TransactionClient,
  req: { ip?: any; headers?: any; socket?: any } | null | undefined,
  data: {
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    oldValue?: unknown;
    newValue?: unknown;
  },
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as Prisma.InputJsonValue } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as Prisma.InputJsonValue } : {}),
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    },
  });
}

// Re-export for call sites that only need to read the IP (e.g. socket contexts).
export type AuditContext = { ip?: any; headers?: any; socket?: any };
