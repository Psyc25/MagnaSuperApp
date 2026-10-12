import type { Furniture, FurnitureKind, Pos, Rect } from "./house";

/**
 * Interaksi perabot Kantor Virtual (permintaan Owner/tim, Okt 2026: "semua
 * perabot bisa dipakai, bukan cuma dekorasi"). Data murni (tanpa React/
 * canvas) supaya gampang dites, sama seperti house.ts. Tiap FurnitureKind
 * dipetakan ke satu InteractionKind -- menentukan pose avatar & label
 * tombol saat dipakai. Kind yang murni dekorasi/storage (rack, counter,
 * car, crate, fence-like) SENGAJA tidak dipetakan (tidak ada entri di
 * INTERACTION_BY_KIND) karena tidak ada pose yang masuk akal untuk itu.
 */

export type InteractionKind = "duduk" | "tidur" | "kerja" | "masak" | "lihat" | "nonton" | "hangat";

export type InteractionConfig = {
  kind: InteractionKind;
  /** Label tombol, mis. "Duduk di Meja Piknik" -- `label` = Furniture.label
   * kalau ada. */
  verb: (label: string) => string;
  /** true = sekali klik langsung lepas lagi otomatis setelah
   * MOMENTARY_INTERACTION_MS (dipakai utk perabot yang ganjil kalau
   * "dipakai" lama, mis. kulkas/mesin kopi); false/absen = toggle ON
   * sampai diklik lagi atau avatar jalan menjauh. */
  momentary?: boolean;
};

export const INTERACTION_BY_KIND: Partial<Record<FurnitureKind, InteractionConfig>> = {
  bigtable: { kind: "duduk", verb: (l) => `Duduk di ${l || "Meja"}` },
  picnictable: { kind: "duduk", verb: (l) => `Duduk di ${l || "Meja Piknik"}` },
  bench: { kind: "duduk", verb: () => "Duduk di Bangku" },
  sofa: { kind: "duduk", verb: (l) => `Duduk di ${l || "Sofa"}` },
  bunkbed: { kind: "tidur", verb: () => "Rebahan Sebentar", momentary: true },
  bed: { kind: "tidur", verb: () => "Rebahan" },
  desk: { kind: "kerja", verb: (l) => `Kerja di Meja ${l}`.trim() },
  coffee: { kind: "masak", verb: () => "Seduh Kopi", momentary: true },
  fridge: { kind: "lihat", verb: () => "Buka Kulkas", momentary: true },
  freezer: { kind: "lihat", verb: () => "Buka Freezer", momentary: true },
  tv: { kind: "nonton", verb: () => "Nonton TV" },
  bonfire: { kind: "hangat", verb: () => "Menghangatkan Diri" },
};

export const INTERACTION_POSE_LABEL: Record<InteractionKind, string> = {
  duduk: "duduk",
  tidur: "rebahan",
  kerja: "kerja",
  masak: "seduh kopi",
  lihat: "lihat-lihat",
  nonton: "nonton",
  hangat: "menghangatkan diri",
};

/** Durasi aksi "momentary" (ms) -- sekali klik, otomatis lepas sendiri
 * tanpa perlu diklik lagi (beda dari toggle duduk/kerja/nonton/hangat). */
export const MOMENTARY_INTERACTION_MS = 1800;

/** Jarak maksimal dari avatar ke tepi perabot supaya bisa dipakai --
 * satuan sama dengan PLAYER_RADIUS/koordinat peta di house.ts. */
export const INTERACT_RADIUS = 46;

function distToRect(p: Pos, rect: Rect): number {
  const cx = Math.min(Math.max(p.x, rect.x), rect.x + rect.w);
  const cy = Math.min(Math.max(p.y, rect.y), rect.y + rect.h);
  return Math.hypot(p.x - cx, p.y - cy);
}

export type InteractableNearby = { furniture: Furniture; config: InteractionConfig };

/** Perabot interaktif terdekat dalam radius, atau null -- dipanggil tiap
 * frame dari game loop, pola sama dengan deteksi "nearby" rekan/NPC yang
 * sudah ada di VirtualOfficeClient. */
export function findNearestInteractable(pos: Pos, furniture: readonly Furniture[]): InteractableNearby | null {
  let best: InteractableNearby | null = null;
  let bestDist = INTERACT_RADIUS;
  for (const item of furniture) {
    const config = INTERACTION_BY_KIND[item.kind];
    if (!config) continue;
    const d = distToRect(pos, item.rect);
    if (d < bestDist) {
      bestDist = d;
      best = { furniture: item, config };
    }
  }
  return best;
}

/** Jarak avatar dari tepi perabot saat berdiri/duduk memakainya -- sama
 * dengan PLAYER_RADIUS (house.ts) biar konsisten sama ukuran tabrakan
 * avatar, dihardcode di sini supaya interactions.ts tetap berdiri sendiri
 * tanpa import dari house.ts selain tipe. */
const STAND_OFFSET = 12;

/** Titik berdiri/duduk avatar saat memakai perabot. Rebahan (tidur) DAN
 * menghangatkan diri (hangat/api unggun) tetap di TENGAH rect -- "tidur"
 * sama seperti slot tidur pasif di Kamar Staff (kasur memang didesain
 * avatar di tengahnya), dan "hangat" karena api unggun kecil & dikepung
 * bangku dari dua sisi (bench-1/bench-2 di house.ts) -- tepi bawah +
 * offset keluar malah bikin titik berdirinya lebih dekat ke bangku
 * tetangga daripada ke api unggun sendiri (ketemu pas nulis tes ini).
 * Interaksi lain (duduk/kerja/masak/lihat/nonton) ditaruh di TEPI BAWAH
 * perabot + sedikit offset ke luar, bukan di tengah kotaknya -- supaya
 * avatar kelihatan "memakai" perabotnya dari depan (nggak nancep/berdiri
 * di tengah-tengah meja atau sofa), dan sekalian bikin urutan gambar
 * depan-belakang benar (avatar selalu di atas/depan perabot, bukan
 * ketutup separuh badan). */
export function interactionStandPoint(item: Furniture): Pos {
  const config = INTERACTION_BY_KIND[item.kind];
  if (config?.kind === "tidur" || config?.kind === "hangat") {
    return { x: item.rect.x + item.rect.w / 2, y: item.rect.y + item.rect.h / 2 };
  }
  return { x: item.rect.x + item.rect.w / 2, y: item.rect.y + item.rect.h + STAND_OFFSET };
}

/** Cari satu objek Furniture dari id-nya -- dipakai buat merender avatar
 * orang lain yang presence-nya bilang "sedang pakai furnitureId X" tanpa
 * perlu nunggu/percaya posisi (x,y) broadcast mereka (biar avatar yang
 * duduk selalu persis di titik perabotnya, bukan geser dikit kalau ada
 * floating point drift). */
export function furnitureById(furniture: readonly Furniture[], id: string): Furniture | null {
  return furniture.find((f) => f.id === id) ?? null;
}
