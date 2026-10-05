import type { BookingStatus } from "./types";

/**
 * Transisi status booking yang sah -- dipakai halaman Booking, Asisten AI,
 * dan updateBookingStatus di server. "Selesai"/"Dibatalkan" final: membuka
 * lagi booking SENGAJA tidak diizinkan karena updateBookingStatus adalah
 * UPDATE status tanpa cek kapasitas (bisa overbooking) -- buat booking baru.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Menunggu: ["Dikonfirmasi", "Dibatalkan"],
  Dikonfirmasi: ["Selesai", "Dibatalkan"],
  Selesai: [],
  Dibatalkan: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}
