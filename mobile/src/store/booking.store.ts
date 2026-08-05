import { create } from 'zustand';

/**
 * Pending direct booking hand-off between the worker profile screen and the
 * bookings screen.
 *
 * The profile page caches the worker payload + the service the customer picked
 * there so the "Send Booking Request" modal can render INSTANTLY on arrival —
 * no worker fetch on the critical path. Addresses still load async in the
 * background. See (customer)/worker/[id].tsx and (customer)/bookings.tsx.
 */
interface BookingState {
  pendingWorkerBookingId: string | null;
  /** Cached worker payload from the profile screen — avoids a blocking fetch. */
  pendingWorkerData: any | null;
  /** Service selected on the profile page (never re-asked inside the modal). */
  pendingService: any | null;
  setPendingBooking: (workerId: string, workerData?: any | null, service?: any | null) => void;
  clearPendingBooking: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  pendingWorkerBookingId: null,
  pendingWorkerData: null,
  pendingService: null,
  setPendingBooking: (workerId, workerData = null, service = null) =>
    set({ pendingWorkerBookingId: workerId, pendingWorkerData: workerData, pendingService: service }),
  clearPendingBooking: () =>
    set({ pendingWorkerBookingId: null, pendingWorkerData: null, pendingService: null }),
}));
