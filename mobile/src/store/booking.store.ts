import { create } from 'zustand';

interface BookingState {
  pendingWorkerBookingId: string | null;
  setPendingWorkerBookingId: (id: string | null) => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  pendingWorkerBookingId: null,
  setPendingWorkerBookingId: (id) => set({ pendingWorkerBookingId: id }),
}));
