import { prisma } from '../config/prisma';

/**
 * Single source of truth for resolving the service location of a booking.
 *
 * Both urgent and normal bookings must resolve the destination the exact same
 * way so a worker always navigates to the customer's intended address:
 *   1. the explicitly chosen `requestedAddressId` (validated as the customer's own), or
 *   2. the customer's default address, or
 *   3. the customer's first saved address.
 *
 * Returns `null` when the customer has no address — callers MUST surface an
 * actionable error ("add an address first") instead of fabricating coordinates.
 */
export async function resolveServiceAddress(
  customerId: string,
  requestedAddressId?: string | null,
) {
  if (requestedAddressId) {
    const chosen = await prisma.address.findFirst({
      where: { id: requestedAddressId, userId: customerId, isDeleted: false },
    });
    if (chosen) return chosen;
  }

  // (0,0) is never a real destination — skip any legacy pin on the ocean and
  // prefer an address with usable coordinates.
  const validCoords = { NOT: { latitude: 0, longitude: 0 } };

  const defaultAddress = await prisma.address.findFirst({
    where: { userId: customerId, isDeleted: false, isDefault: true, ...validCoords },
  });
  if (defaultAddress) return defaultAddress;

  return prisma.address.findFirst({
    where: { userId: customerId, isDeleted: false, ...validCoords },
  });
}
