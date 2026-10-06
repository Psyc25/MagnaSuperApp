/**
 * "Nama panggilan" -- dulu disebut username dan dipakai untuk LOGIN. Sejak
 * login pindah ke email, nilai ini murni identitas di dalam aplikasi: dipakai
 * untuk @tag di Chat dan Kantor Virtual. Disimpan di kolom lama
 * `profiles.username` (unik, dijaga trigger protect_privileged_profile_columns
 * -- karena itu perubahannya lewat service role di server, setelah server
 * memastikan pemanggil hanya mengubah miliknya sendiri).
 *
 * Polanya HARUS sama dengan MENTION_PATTERN di src/lib/chat/actions.ts dan
 * highlight di ChatClient.tsx, supaya setiap nama panggilan bisa di-@tag.
 */
export const NICKNAME_PATTERN = /^[a-z0-9._-]{3,20}$/;
export const NICKNAME_RULE = "Nama panggilan 3-20 karakter: huruf, angka, titik, garis bawah, atau strip (tanpa spasi).";

/** Huruf kecil, tanpa spasi di ujung. Spasi di tengah TIDAK dibuang diam-diam
 * -- biar validasi yang menolak dengan pesan jelas. */
export function normalizeNickname(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

export function isValidNickname(nickname: string): boolean {
  return NICKNAME_PATTERN.test(nickname);
}

/**
 * Usulan nama panggilan dari nama lengkap (kata pertama), dipakai saat admin
 * membuat akun tanpa mengisi nama panggilan. Karakter di luar pola dibuang;
 * kalau hasilnya terlalu pendek, pakai bagian depan email.
 */
export function suggestNickname(fullName: string, email: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const first = clean(fullName.trim().split(/\s+/)[0] ?? "");
  const base = first.length >= 3 ? first : clean(email.split("@")[0] ?? "");
  const padded = base.length >= 3 ? base : `${base}user`;
  return padded.slice(0, 20);
}
