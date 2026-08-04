import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const isDev = process.env.NODE_ENV !== 'production'

export const prisma =
  global.prisma ||
  new PrismaClient({
    // Query-level logging is extremely noisy and logs SQL+bind params — dev only.
    log: isDev ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  })

if (isDev) {
  global.prisma = prisma
}