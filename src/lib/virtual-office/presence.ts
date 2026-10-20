/**
 * Presence Kantor Virtual -- dipakai di DUA tempat:
 * 1. VirtualOfficePresenceProvider (dipasang di AppShell, semua halaman
 *    dashboard): join channel sekali per tab, lapor "online" + tampilan
 *    karakter + status, TANPA posisi (orangnya belum tentu di peta).
 * 2. VirtualOfficeClient (halaman Kantor Virtual): pinjam channel yang
 *    SAMA dari context (bukan bikin channel baru -- Supabase Presence
 *    mencatat tiap channel.subscribe() sebagai entri terpisah, jadi kalau
 *    dua komponen subscribe sendiri-sendiri dengan key yang sama, satu
 *    orang bisa muncul dobel di presence state), cuma menambahkan
 *    `inOffice: true` + posisi live lewat broadcast "move" terpisah.
 *
 * Konsekuensi langsung: staff yang sekadar buka MagnaSuperApp (modul apa
 * saja) otomatis "online" di Kantor Virtual tanpa perlu membuka halaman
 * itu -- sesuai permintaan Owner.
 */

import type { AvatarLook } from "./avatar-look";

export const VIRTUAL_OFFICE_CHANNEL = "kantor-virtual";

export type PresenceStatus = "available" | "meeting" | "fokus" | "away";

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  available: "Available",
  meeting: "Lagi Meeting",
  fokus: "Fokus",
  away: "Away",
};
/** Warna dot status (dipakai di avatar & UI pemilih status). Merah
 * ("fokus") dibikin beda dari badge urgent (lihat hasUrgentNotification)
 * walau warnanya kebetulan sama -- satu status pilihan sendiri, satu lagi
 * data notifikasi asli, ditaruh di sisi kepala yang berbeda saat digambar
 * (lihat Avatars.tsx) supaya tidak tertukar. */
export const STATUS_COLORS: Record<PresenceStatus, string> = {
  available: "#22c55e",
  meeting: "#f59e0b",
  fokus: "#ef4444",
  away: "#64748b",
};

export type PresenceMeta = {
  onlineAt?: string;
  look?: unknown;
  /** true kalau orangnya sedang benar-benar di halaman Kantor Virtual
   * (jalan live); false/absen = cuma "online" di halaman lain. */
  inOffice?: boolean;
  status?: PresenceStatus | null;
  /** true kalau orang ini punya notifikasi PENTING yang belum dibaca
   * (lihat listUnreadImportantNotifications di lib/notifications/actions.ts
   * -- data ASLI, bukan dekorasi, dipoll ringan dari PresenceProvider).
   * Dipakai badge "!" di atas avatar, permintaan Owner terinspirasi video
   * referensi virtual office lain: "biar lebih nyata". Visibilitasnya SAMA
   * seperti `status` di atas -- kelihatan oleh semua rekan, bukan cuma
   * diri sendiri. */
  hasUrgentNotification?: boolean;
};

export type ResolvedPresence = {
  look: AvatarLook;
  inOffice: boolean;
  /** Belum pernah pilih status eksplisit = dianggap "available" (default
   * umum), bukan null -- biar dot status selalu konsisten tampil. */
  status: PresenceStatus;
  hasUrgentNotification: boolean;
};

/** Emote/chat bubble ephemeral di atas avatar -- broadcast "emote" terpisah
 * dari presence.track() (bukan status permanen, cuma numpang lewat beberapa
 * detik), jadi tidak ikut tersimpan/replay saat orang baru join channel. */
export const EMOTE_DURATION_MS = 4000;

export type EmotePayload = { id: string; content: string };

export const QUICK_EMOTES = ["👍", "😂", "❤️", "😮", "👋", "✅"] as const;

/** Batas panjang teks emote/chat bubble bebas (permintaan Owner: "lebih
 * nyata", terinspirasi video referensi -- bubble sekarang bisa nampung
 * obrolan pendek, bukan cuma reaksi 1-2 kata). */
export const EMOTE_MAX_LENGTH = 140;

/**
 * Lama tampil bubble, FUNGSI dari panjang teksnya -- pesan panjang perlu
 * waktu baca lebih lama daripada reaksi singkat seperti "👍". Nilainya
 * murni dihitung dari `content` (tidak pernah di-broadcast terpisah),
 * jadi pengirim & penerima (lihat remoteEmoteRef di PresenceProvider)
 * selalu dapat angka yang SAMA tanpa perlu kirim field tambahan.
 */
export function emoteDurationFor(content: string): number {
  return Math.min(11000, Math.max(EMOTE_DURATION_MS, 2200 + content.length * 65));
}

/**
 * Aksi gestur avatar (Opsi B, laporan gap Oktober 2026) -- beda dari emote
 * di atas: emote cuma bubble teks/emoji mengambang, aksi ini benar-benar
 * menggerakkan lengan/badan avatar (lihat drawAvatar di Avatars.tsx)
 * selama ACTION_ANIM_MS lalu kembali ke pose normal. Disiarkan lewat
 * broadcast "action" terpisah dari broadcast "emote", numpang channel
 * presence yang sama.
 */
export type AvatarActionKind = "tonjok" | "tos" | "lambai";

export const QUICK_ACTIONS: { id: AvatarActionKind; emoji: string; label: string }[] = [
  { id: "tonjok", emoji: "👊", label: "Tonjok" },
  { id: "tos", emoji: "🙌", label: "Tos" },
  { id: "lambai", emoji: "👋", label: "Lambai" },
];

export type ActionPayload = { id: string; action: AvatarActionKind };

/** Durasi animasi lengan sekali aksi (~0,4 detik sesuai keputusan Owner). */
export const ACTION_ANIM_MS = 400;
/** Cooldown antar aksi per orang -- cegah spam tombol (~3 detik). */
export const ACTION_COOLDOWN_MS = 3000;

/**
 * Interaksi perabot (lihat interactions.ts, laporan gap Oktober 2026:
 * "semua perabot bisa dipakai, bukan cuma dekorasi") -- beda dari
 * action/emote di atas: ini status TOGGLE (sedang memakai perabot id X,
 * atau tidak sama sekali), bukan animasi sesaat, jadi TIDAK kadaluarsa
 * sendiri lewat `at` -- cuma berubah saat orangnya mulai/berhenti
 * memakai perabotnya (lihat broadcastInteract di PresenceProvider).
 * `furnitureId: null` = orang itu sedang tidak memakai perabot apa pun.
 */
export type InteractPayload = { id: string; furnitureId: string | null };
