/**
 * Tampilan karakter Kantor Virtual yang bisa diubah sendiri oleh tiap
 * orang (permintaan Owner). Disimpan di `user_metadata.avatar_look` akun
 * Supabase Auth -- pemilik akun boleh mengubah user_metadata-nya sendiri,
 * jadi tidak perlu kolom/migrasi baru, dan tidak bisa mengubah milik orang
 * lain. Semua nilai dibatasi ke palet di bawah (sanitizeLook) supaya isi
 * user_metadata yang diutak-atik lewat API tidak bisa menyelipkan apa pun
 * ke tampilan orang lain.
 */

export const SKIN_TONES = ["#fde3c8", "#f5c9a0", "#e0a878", "#c68a5c", "#8d5a3b", "#5c3a26"] as const;
export const HAIR_COLORS = ["#1f1a17", "#4a2f1f", "#8b5a2b", "#d9a441", "#b0b0b0", "#c2410c", "#7c3aed", "#0ea5e9"] as const;
export const HAIR_STYLES = ["pendek", "panjang", "botak", "topi", "hijab"] as const;
export const SHIRT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f8fafc",
  "#334155",
  "#111827",
] as const;
export const PANTS_COLORS = ["#1e293b", "#1e3a8a", "#57534e", "#a16207", "#f1f5f9"] as const;
export const ACCESSORIES = ["tidak ada", "kacamata", "headphone"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];

export type AvatarLook = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  accessory: Accessory;
};

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  pendek: "Pendek",
  panjang: "Panjang",
  botak: "Botak",
  topi: "Topi",
  hijab: "Hijab",
};

export const ACCESSORY_LABELS: Record<Accessory, string> = {
  "tidak ada": "Tidak ada",
  kacamata: "Kacamata",
  headphone: "Headphone",
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tampilan bawaan sebelum orangnya mengubah sendiri: acak tapi tetap
 * (diturunkan dari id), supaya tiap orang langsung kelihatan beda. */
export function defaultLook(userId: string): AvatarLook {
  const h = hash(userId);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >>> 3) % 3],
    hairStyle: (["pendek", "panjang"] as const)[(h >>> 6) % 2],
    shirt: SHIRT_COLORS[(h >>> 8) % SHIRT_COLORS.length],
    pants: PANTS_COLORS[(h >>> 12) % 3],
    accessory: "tidak ada",
  };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Nilai di luar palet diganti nilai bawaan orang itu. */
export function sanitizeLook(input: unknown, userId: string): AvatarLook {
  const base = defaultLook(userId);
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    skin: pick(raw.skin, SKIN_TONES, base.skin as (typeof SKIN_TONES)[number]),
    hair: pick(raw.hair, HAIR_COLORS, base.hair as (typeof HAIR_COLORS)[number]),
    hairStyle: pick(raw.hairStyle, HAIR_STYLES, base.hairStyle),
    shirt: pick(raw.shirt, SHIRT_COLORS, base.shirt as (typeof SHIRT_COLORS)[number]),
    pants: pick(raw.pants, PANTS_COLORS, base.pants as (typeof PANTS_COLORS)[number]),
    accessory: pick(raw.accessory, ACCESSORIES, base.accessory),
  };
}
