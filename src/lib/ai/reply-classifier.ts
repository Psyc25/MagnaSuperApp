/**
 * Klasifikasi jawaban user atas ringkasan konfirmasi aksi Asisten AI.
 * Dipisah dari actions.ts ("use server" hanya boleh mengekspor fungsi
 * async) supaya bisa diuji unit.
 */

const CONFIRM_WORDS = new Set([
  "ya", "iya", "yes", "y", "ok", "oke", "okay", "okey", "lanjut", "lanjutkan", "konfirmasi", "setuju", "benar",
  "betul", "bener", "baik", "simpan", "boleh", "silakan", "siap", "sip", "gas", "yup", "yap", "yoi",
]);
const CANCEL_WORDS = new Set([
  "batal", "batalkan", "tidak", "tdk", "gak", "ga", "gk", "nggak", "ngga", "enggak", "engga", "no", "nope", "cancel", "jangan",
]);
/** Kata pelengkap yang boleh menyertai jawaban ya/batal ("ya simpan saja",
 * "tidak jadi", "oke deh"). */
const FILLER_WORDS = new Set([
  "saja", "aja", "usah", "dong", "deh", "kok", "jadi", "dulu", "sudah", "udah", "kak", "min", "please", "tolong",
]);

/**
 * "ya lanjut" / "oke simpan aja" = konfirmasi; "tidak jadi" = batal. Dulu cuma
 * satu kata persis yang dikenali, jadi "Ya, lanjut" diam-diam MEMBUANG aksi
 * yang sedang menunggu konfirmasi. Kalimat yang mengandung hal lain (mis.
 * "ya tapi tanggalnya ganti") tetap diteruskan ke AI.
 */
export function classifyReply(text: string): "confirm" | "cancel" | null {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  const onlyFrom = (set: Set<string>) => words.every((w) => set.has(w) || FILLER_WORDS.has(w));
  if (words.some((w) => CANCEL_WORDS.has(w)) && onlyFrom(CANCEL_WORDS)) return "cancel";
  if (words.some((w) => CONFIRM_WORDS.has(w)) && onlyFrom(CONFIRM_WORDS)) return "confirm";
  return null;
}
