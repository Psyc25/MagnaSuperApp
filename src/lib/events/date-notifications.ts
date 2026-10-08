import type { EventStatus } from "./types";

/**
 * Baris minimal dari tabel `events` yang dibutuhkan untuk menentukan
 * notifikasi mulai/selesai -- dipakai cron `/api/cron/event-date-notifications`.
 * Gap ditemukan saat QC event "GRAB MODIS" (6 Okt 2026, permintaan Owner):
 * sebelum ini TIDAK ADA notifikasi otomatis saat event mulai/selesai, cuma
 * "Event Baru" saat dibuat & milestone loading (lihat `createEvent` /
 * `notifyLoadingMilestone` di actions.ts) -- keduanya bukan date-based.
 */
export type EventDateNotificationRow = {
  id: string;
  name: string;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: EventStatus;
  startNotifiedAt: string | null;
  endNotifiedAt: string | null;
};

/**
 * Event yang `start_date`-nya SUDAH TIBA (<= hari ini) tapi belum pernah
 * dikirimi notifikasi "Event Dimulai". Event "Dibatalkan" dilewati -- tidak
 * ada gunanya mengumumkan event yang sudah batal. Event "Selesai" (staf
 * sudah menutupnya manual dari Papan Tracking/Admin, lihat `updateEventStatus`
 * di actions.ts) juga dilewati, SENGAJA DITAMBAHKAN (bugfix, permintaan
 * Owner Okt 2026) -- kalau event sudah ditutup duluan, tidak ada gunanya
 * lagi mengingatkan "siap-siap mulai".
 *
 * Pakai kolom `start_notified_at` (migrasi 0097) sebagai penanda, SENGAJA
 * BEDA dari pola cocok-hari-H-persis di `computeDueReminders`
 * (lib/invoices/reminders.ts) -- supaya kalau cron ini sampai gagal jalan
 * tepat di hari mulainya (mis. deploy bermasalah), event itu TETAP kebagian
 * notifikasi begitu cron jalan lagi di hari berikutnya, bukan terlewat
 * selamanya.
 */
export function computeStartDue(events: EventDateNotificationRow[], today: string): EventDateNotificationRow[] {
  return events.filter(
    (e) => e.status === "Berjalan" && !!e.startDate && e.startDate <= today && !e.startNotifiedAt
  );
}

/**
 * Sama seperti `computeStartDue`, untuk `end_date` + `end_notified_at`.
 * Bugfix (permintaan Owner Okt 2026): sebelum ini cuma melewati status
 * "Dibatalkan" -- event yang sudah ditandai "Selesai" (staf sudah tutup
 * sendiri checklist Loading Out/Finish-nya) TETAP kebagian notifikasi
 * "Event Selesai" yang isinya menyuruh cek checklist & tutup realisasi,
 * padahal itu sudah dilakukan. Sekarang event "Selesai" dilewati juga --
 * lihat `updateEventStatus` di actions.ts untuk pembersihan notifikasi
 * yang SUDAH terkirim sebelum status berubah jadi "Selesai".
 */
export function computeEndDue(events: EventDateNotificationRow[], today: string): EventDateNotificationRow[] {
  return events.filter((e) => e.status === "Berjalan" && !!e.endDate && e.endDate <= today && !e.endNotifiedAt);
}

function label(e: Pick<EventDateNotificationRow, "name" | "clientName">): string {
  return `${e.name}${e.clientName ? ` — ${e.clientName}` : ""}`;
}

export function startTitle(): string {
  return "Event Dimulai";
}

export function endTitle(): string {
  return "Event Selesai";
}

export function startBody(e: EventDateNotificationRow): string {
  return `${label(e)} mulai hari ini${e.endDate ? `, berjalan sampai ${e.endDate}` : ""}. Pastikan checklist & tim lapangan siap.`;
}

export function endBody(e: EventDateNotificationRow): string {
  return `${label(e)} sudah melewati tanggal selesai (${e.endDate}). Cek checklist Loading Out/Finish & tutup realisasi event ini.`;
}
