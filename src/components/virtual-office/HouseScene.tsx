"use client";

import {
  ARTWORKS,
  FENCE,
  FLOOR2_BOUNDS,
  OUTBUILDING_WALLS,
  OWNER_DOOR,
  ROOMS,
  SIGNS,
  STAIRS_DOWN_ZONE,
  WALLS,
  WINDOWS,
  getRoom,
  type Furniture,
} from "@/lib/virtual-office/house";
import { chunkyCircle, chunkyRect, outlinedText, roundRectPath } from "./draw2d";

/**
 * Render 2D top-down Kantor Virtual (rewrite Oktober 2026 dari
 * react-three-fiber ke Canvas 2D API -- permintaan Owner: "diubah seperti
 * gambar referensi, dibuat interaktif seperti game"). Gaya "chunky
 * pixel-art" dibuat 100% lewat kode (lihat draw2d.ts), BUKAN menjiplak
 * gambar referensi yang dikirim -- itu cuma dipakai sebagai inspirasi
 * palet warna & suasana, sudah dikonfirmasi ke Owner.
 *
 * Semua fungsi di sini menggambar langsung di koordinat DUNIA (sama
 * seperti Rect/Pos di house.ts) -- kamera (lihat Camera & applyCameraTransform
 * di bawah) diterapkan SEKALI per frame oleh pemanggil (VirtualOfficeClient)
 * lewat ctx.setTransform, jadi fungsi gambar di sini tidak perlu tahu soal
 * kamera/zoom/posisi layar sama sekali.
 *
 * FURNITURE SENGAJA TIDAK digambar di drawGround -- itu digambar satu per
 * satu lewat drawFurnitureItem oleh VirtualOfficeClient, diurutkan bareng
 * avatar berdasarkan Y (painter's algorithm) supaya avatar bisa kelihatan
 * benar di depan/belakang perabot. Tembok/pagar aman digambar di sini
 * (tidak diurutkan) karena avatar tidak pernah bisa menempati pixel
 * tembok itu sendiri (dicegah tabrakan di house.ts resolveMove).
 */

export type Camera = { x: number; y: number; scale: number };
export const DEFAULT_CAMERA_SCALE = 1.3;

/** Terapkan transform kamera (posisi dunia -> tengah layar) satu kali per
 * frame, SEBELUM menggambar apa pun -- dipanggil VirtualOfficeClient. */
export function applyCameraTransform(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  cssWidth: number,
  cssHeight: number
): void {
  const s = cam.scale * dpr;
  ctx.setTransform(s, 0, 0, s, (cssWidth / 2) * dpr - cam.x * s, (cssHeight / 2) * dpr - cam.y * s);
}

/** RNG seeded sederhana (mulberry32) -- dipakai SEKALI di module scope
 * buat naruh rumput/percikan tekstur lantai/debu di posisi yang TETAP
 * (deterministic, nggak "lompat-lompat" posisi tiap render), cuma
 * goyangan/kedipannya yang animasi tiap frame lewat `now`. Ditambahkan
 * Oktober 2026 (feedback Owner: scene terasa flat/kaku -- lantai & halaman
 * sebelumnya warna solid doang, nggak ada tekstur/gerak sama sekali
 * selain api unggun). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BELAKANG_RECT = getRoom("belakang").rect;
const HALAMAN_DEPAN_RECT = getRoom("halamandepan").rect;

type GrassTuft = { x: number; y: number; h: number; seed: number };

function scatterGrass(rect: { x: number; y: number; w: number; h: number }, rng: () => number, count: number): GrassTuft[] {
  const out: GrassTuft[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ x: rect.x + rng() * rect.w, y: rect.y + rng() * rect.h, h: 4 + rng() * 4, seed: rng() * 1000 });
  }
  return out;
}

/** Rumput kecil tersebar di Halaman Depan & Belakang -- bikin halaman
 * nggak terasa flat warna solid doang. Goyangannya dihitung di
 * drawGround() dari `now`, bukan disimpan di sini (posisi tetap statis). */
const GRASS_TUFTS: GrassTuft[] = [...scatterGrass(BELAKANG_RECT, mulberry32(42), 90), ...scatterGrass(HALAMAN_DEPAN_RECT, mulberry32(43), 90)];

type FloorSpeckle = { x: number; y: number; r: number; alpha: number };

function scatterSpeckles(rect: { x: number; y: number; w: number; h: number }, rng: () => number, count: number): FloorSpeckle[] {
  const out: FloorSpeckle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ x: rect.x + rng() * rect.w, y: rect.y + rng() * rect.h, r: 1 + rng() * 2, alpha: 0.03 + rng() * 0.05 });
  }
  return out;
}

/** Percikan tekstur halus di tiap ruangan dalam rumah (lantai kayu/semen
 * sebelumnya warna flat solid) -- statis (nggak animasi), cuma bikin
 * permukaannya terasa sedikit "berserat" tanpa perlu asset gambar. */
const INDOOR_ROOM_IDS: readonly string[] = ["it", "depan", "lorong", "creative", "owner", "staff", "tangga", "koridor", "dapur", "gabungan", "garasi", "barangbesar"];
const floorSpeckleRng = mulberry32(7);
const FLOOR_SPECKLES: FloorSpeckle[] = ROOMS.filter((r) => INDOOR_ROOM_IDS.includes(r.id)).flatMap((r) =>
  scatterSpeckles(r.rect, floorSpeckleRng, Math.max(10, Math.round((r.rect.w * r.rect.h) / 900)))
);

type DustParticle = { baseX: number; baseY: number; driftX: number; driftY: number; period: number; seed: number; r: number };

function scatterDust(rect: { x: number; y: number; w: number; h: number }, rng: () => number, count: number): DustParticle[] {
  const out: DustParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      baseX: rect.x + rng() * rect.w,
      baseY: rect.y + rng() * rect.h,
      driftX: 14 + rng() * 18,
      driftY: 8 + rng() * 10,
      period: 7000 + rng() * 5000,
      seed: rng() * 1000,
      r: 1 + rng() * 1.4,
    });
  }
  return out;
}

/** Debu/kabut tipis melayang pelan di halaman -- sebelum revisi ini,
 * satu-satunya elemen BERGERAK di scene (selain avatar) cuma api unggun. */
const DUST_PARTICLES: DustParticle[] = [...scatterDust(BELAKANG_RECT, mulberry32(99), 10), ...scatterDust(HALAMAN_DEPAN_RECT, mulberry32(100), 10)];

const WALL_COLORS = {
  house: "#e7e5e4",
  outbuilding: "#d6d3d1",
  fence: "#3f6212",
  doorClosed: "#92400e",
} as const;

function drawWallRect(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, variant: keyof typeof WALL_COLORS): void {
  chunkyRect(ctx, rect.x, rect.y, rect.w, rect.h, WALL_COLORS[variant], { radius: variant === "fence" ? 1.5 : 2.5 });
}

function drawStairs(ctx: CanvasRenderingContext2D): void {
  const tangga = getRoom("tangga").rect;
  const steps = 8;
  const stepDepth = tangga.h / steps;
  for (let i = 0; i < steps; i += 1) {
    const sy = tangga.y + tangga.h - (i + 1) * stepDepth;
    chunkyRect(ctx, tangga.x + 4, sy, tangga.w - 8, stepDepth - 1, i % 2 ? "#a8a29e" : "#d6d3d1", {
      radius: 1,
      shadow: false,
    });
  }
  outlinedText(ctx, "TANGGA ↑ GUDANG", tangga.x + tangga.w / 2, tangga.y - 10, { size: 8 });
}

function drawFloor2(ctx: CanvasRenderingContext2D): void {
  const b = FLOOR2_BOUNDS;
  ctx.fillStyle = "#0b1120";
  ctx.fillRect(b.x - 40, b.y - 40, b.w + 80, b.h + 80);
  ctx.fillStyle = getRoom("gudang").floor;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  const walls = [
    { x: b.x, y: b.y - 4, w: b.w, h: 8 },
    { x: b.x, y: b.y + b.h - 4, w: b.w, h: 8 },
    { x: b.x - 4, y: b.y, w: 8, h: b.h },
    { x: b.x + b.w - 4, y: b.y, w: 8, h: b.h },
  ];
  for (const w of walls) drawWallRect(ctx, w, "outbuilding");

  const z = STAIRS_DOWN_ZONE;
  chunkyRect(ctx, z.x, z.y, z.w, z.h, "#d6d3d1", { radius: 2, shadow: false });
  outlinedText(ctx, "TANGGA ↓ TURUN", z.x + z.w / 2, z.y + z.h / 2, { size: 9 });
  outlinedText(ctx, "GUDANG ALAT & BARANG · LT. 2", b.x + 390, b.y + 30, { size: 14 });
}

/** Lantai, tembok, pagar, jendela, pajangan, tangga -- semua yang TIDAK
 * perlu diurutkan Y dengan avatar. Dipanggil sekali per frame, setelah
 * applyCameraTransform, sebelum perabot & avatar digambar. */
export function drawGround(ctx: CanvasRenderingContext2D, now: number, opts: { ownerDoorOpen: boolean }): void {
  const g = { x: 40, y: 40, w: 820, h: 950 };

  ctx.fillStyle = "#14532d";
  ctx.fillRect(g.x - 160, g.y - 160, g.w + 320, g.h + 320);

  for (const r of ROOMS) {
    if (r.id === "belakang" || r.id === "halamandepan") {
      ctx.fillStyle = r.floor;
      ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
    }
  }

  // Rumput kecil goyang pelan (angin) -- dekat tiang jalan setapak/gerbang
  // nanti ketutup gambar di bawah (jalan, rumah, perabot), jadi cuma
  // kelihatan di area rumput terbuka seperti seharusnya.
  ctx.save();
  ctx.strokeStyle = "rgba(134,239,172,0.5)";
  ctx.lineWidth = 1.3;
  for (const t of GRASS_TUFTS) {
    const sway = Math.sin(now / 1400 + t.seed) * 2;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + sway, t.y - t.h);
    ctx.moveTo(t.x + 2, t.y);
    ctx.lineTo(t.x + 2 + sway * 0.7, t.y - t.h * 0.72);
    ctx.stroke();
  }
  ctx.restore();

  // Jalan setapak gerbang -> pintu utama.
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(420, 880, 60, 108);

  for (const r of ROOMS) {
    if (r.id === "belakang" || r.id === "halamandepan" || r.id === "gudang") continue;
    ctx.fillStyle = r.floor;
    ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
  }

  // Percikan tekstur halus di lantai dalam rumah -- lantai sebelumnya
  // warna flat solid doang, ini bikin terasa sedikit "berserat" tanpa
  // perlu asset gambar (statis, nggak perlu animasi tiap frame).
  ctx.save();
  for (const s of FLOOR_SPECKLES) {
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (const r of ROOMS) {
    if (!r.showLabel || r.id === "gudang") continue;
    outlinedText(ctx, r.label.toUpperCase(), r.rect.x + r.rect.w / 2, r.rect.y + 22, {
      size: r.id === "it" ? 9 : 12,
      color: "rgba(255,255,255,0.6)",
      outline: "rgba(0,0,0,0.4)",
    });
  }

  for (const w of FENCE) drawWallRect(ctx, w, "fence");
  chunkyRect(ctx, 382, 982, 10, 12, "#57534e");
  chunkyRect(ctx, 508, 982, 10, 12, "#57534e");
  outlinedText(ctx, "GERBANG", 450, 970, { size: 10 });

  for (const w of WINDOWS) {
    chunkyRect(ctx, w.x, w.y - 1, w.w, w.h + 2, "#7dd3fc", { glow: "#0ea5e9", opacity: 0.85, radius: 1.5 });
  }

  for (const w of OUTBUILDING_WALLS) drawWallRect(ctx, w, "outbuilding");
  for (const w of WALLS) drawWallRect(ctx, w, "house");

  if (!opts.ownerDoorOpen) drawWallRect(ctx, OWNER_DOOR, "doorClosed");

  for (const a of ARTWORKS) {
    chunkyRect(ctx, a.x - 2, a.y - 16, 4, 32, a.color, { glow: a.color, radius: 1.5 });
    outlinedText(ctx, a.label, a.wall === "left" ? a.x + 26 : a.x - 26, a.y, { size: 8 });
  }
  for (const s of SIGNS) outlinedText(ctx, s.text, s.x, s.y, { size: 9, color: "#fef3c7" });

  drawStairs(ctx);
  drawFloor2(ctx);

  // Debu/kabut tipis melayang pelan di halaman -- sebelum ini,
  // satu-satunya elemen BERGERAK di scene (selain avatar) cuma api
  // unggun. Ditaruh paling akhir (masih di bawah perabot/avatar, yang
  // digambar terpisah sesudah drawGround oleh pemanggil).
  ctx.save();
  for (const d of DUST_PARTICLES) {
    const t = (now % d.period) / d.period;
    const angle = t * Math.PI * 2;
    const dx = Math.cos(angle + d.seed) * d.driftX;
    const dy = Math.sin(angle * 1.3 + d.seed) * d.driftY;
    const alpha = Math.max(0.03, 0.12 + Math.sin(angle) * 0.08);
    ctx.fillStyle = `rgba(226,232,240,${alpha})`;
    ctx.beginPath();
    ctx.arc(d.baseX + dx, d.baseY + dy, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Satu item perabot -- dipanggil terpisah per item (bukan lewat
 * drawGround) supaya VirtualOfficeClient bisa mengurutkannya bareng
 * avatar berdasarkan Y sebelum digambar (painter's algorithm). `now` =
 * Date.now() milik pemanggil -- dipakai bonfire (kedip api) & plant
 * (goyang daun pelan), supaya perabot nggak semua beku total. */
export function drawFurnitureItem(ctx: CanvasRenderingContext2D, item: Furniture, now: number): void {
  const r = item.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  switch (item.kind) {
    case "bunkbed": {
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#cbd5e1", { radius: 2 });
      chunkyRect(ctx, r.x + 3, r.y + 3, r.w - 6, 7, "#f8fafc", { radius: 2, shadow: false });
      const corners: Array<[number, number]> = [
        [r.x, r.y],
        [r.x + r.w - 3, r.y],
        [r.x, r.y + r.h - 3],
        [r.x + r.w - 3, r.y + r.h - 3],
      ];
      for (const [px, py] of corners) chunkyRect(ctx, px, py, 3, 3, "#64748b", { shadow: false, radius: 0.5 });
      break;
    }
    case "bigtable": {
      const chairs: Array<[number, number]> = [
        ...[128, 168, 210, 252].flatMap((x) => [
          [x, r.y - 10] as [number, number],
          [x, r.y + r.h + 10] as [number, number],
        ]),
        [r.x - 10, cy],
        [r.x + r.w + 10, cy],
      ];
      for (const [x, y] of chairs) chunkyRect(ctx, x - 6, y - 6, 12, 12, "#1f2937", { radius: 2 });
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#e2c9a0");
      chunkyRect(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, "#7c5a3a", { shadow: false, radius: 2 });
      chunkyRect(ctx, r.x + 8, r.y + 8, r.w - 16, 2, "#ffffff", { shadow: false, radius: 1, opacity: 0.18 });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    }
    case "fridge":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#e5e7eb");
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "freezer":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#bae6fd");
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "coffee":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#78350f");
      chunkyRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, "#111827", { shadow: false, radius: 1.5 });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "counter":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#b08968");
      break;
    case "desk":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#d6d3d1");
      chunkyRect(ctx, r.x + 2, r.y + 1.5, r.w - 4, 1.6, "#ffffff", { shadow: false, radius: 0.8, opacity: 0.35 });
      chunkyRect(ctx, cx - 8, r.y + 2, 16, r.h - 4, "#111827", { shadow: false, glow: "#38bdf8", radius: 1.5 });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "board":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#f8fafc");
      if (item.label) outlinedText(ctx, item.label, cx + 10, cy, { size: 8 });
      break;
    case "tv":
      chunkyRect(ctx, cx - 2, cy - 2, 4, 4, "#334155", { shadow: false });
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#0f172a", { glow: "#1d4ed8" });
      outlinedText(ctx, "TV MEETING", cx, r.y - 8, { size: 8 });
      break;
    case "bed":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#e7e5e4");
      chunkyRect(ctx, r.x + r.w - 16, r.y + 6, 12, r.h - 12, "#f8fafc", { shadow: false, radius: 1.5 });
      chunkyRect(ctx, r.x, r.y + r.h - 10, r.w - 20, 10, "#b45309", { shadow: false, radius: 1.5 });
      break;
    case "car":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#1d4ed8");
      chunkyRect(ctx, r.x + 40, r.y + 8, r.w - 80, r.h - 16, "#93c5fd", { shadow: false, opacity: 0.85, radius: 3 });
      break;
    case "crate":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#a16207");
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "rack":
      for (const sy of [0, 16, 32]) chunkyRect(ctx, r.x, r.y + sy + 4, r.w, 3, "#94a3b8", { shadow: false, radius: 1 });
      chunkyRect(ctx, r.x + 10, r.y + 10, 24, 20, "#a16207", { shadow: false, radius: 2 });
      chunkyRect(ctx, r.x + 50, r.y + 20, 30, 24, "#475569", { shadow: false, radius: 2 });
      break;
    case "picnictable":
      // Beda dari "bigtable": bangku menempel di kedua sisi panjang meja
      // (bukan kursi lepas-lepas di sekeliling) -- referensi suasana
      // piknik Halaman Depan.
      chunkyRect(ctx, r.x - 12, r.y + 3, 10, r.h - 6, "#6b4226", { shadow: false, radius: 2 });
      chunkyRect(ctx, r.x + r.w + 2, r.y + 3, 10, r.h - 6, "#6b4226", { shadow: false, radius: 2 });
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#8b5e34");
      chunkyRect(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, "#5c3b1e", { shadow: false, radius: 2 });
      chunkyRect(ctx, r.x + 8, r.y + 8, r.w - 16, 1.6, "#ffffff", { shadow: false, radius: 0.8, opacity: 0.16 });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    case "bench":
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#6b4226");
      break;
    case "sofa": {
      // Sofa krem empuk -- terinspirasi palet referensi sofa isometrik
      // yang dikirim Owner (warna/suasana saja, digambar ulang 100% lewat
      // kode gaya "chunky pixel-art" top-down, bukan jiplak gambarnya).
      // Karpet oval di bawahnya -- detail kecil biar sudutnya kerasa jadi
      // "nook" santai, bukan cuma satu kotak sofa ngambang di lantai kosong.
      ctx.save();
      ctx.fillStyle = "rgba(180,83,9,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + r.h * 0.55, r.w * 0.85, r.h * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#e8ddc7", { radius: 3 });
      chunkyRect(ctx, r.x + 4, r.y + 4, r.w - 8, 7, "#cbb896", { shadow: false, radius: 2 });
      const seatGap = (r.w - 8) / 2;
      chunkyRect(ctx, r.x + 4 + seatGap - 1, r.y + 4, 2, r.h - 8, "#cbb896", { shadow: false, radius: 1 });
      for (const [lx, ly] of [
        [r.x + 2, r.y + r.h - 3],
        [r.x + r.w - 5, r.y + r.h - 3],
      ] as Array<[number, number]>) {
        chunkyRect(ctx, lx, ly, 3, 4, "#7c5a3a", { shadow: false, radius: 0.5 });
      }
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    }
    case "plant": {
      // Tanaman hias pot -- dekorasi murni (tidak ada di INTERACTION_BY_KIND,
      // sama seperti rack/crate/car), terinspirasi referensi komposisi
      // tanaman & pohon pixel-art. Daun goyang pelan (angin) -- dulu cuma
      // api unggun yang punya animasi apa pun di seluruh scene.
      const sway = Math.sin(now / 1300 + r.x * 0.1) * 1.6;
      chunkyRect(ctx, r.x, r.y + r.h * 0.55, r.w, r.h * 0.45, "#b45309", { radius: 2, shadow: false });
      chunkyCircle(ctx, cx + sway, r.y + r.h * 0.32, r.w * 0.48, "#3f6212", { shadow: false });
      chunkyCircle(ctx, cx - r.w * 0.16 + sway * 0.6, r.y + r.h * 0.2, r.w * 0.3, "#65a30d", { shadow: false });
      chunkyCircle(ctx, cx + r.w * 0.1 + sway * 1.2, r.y + r.h * 0.14, r.w * 0.14, "#86efac", { shadow: false, opacity: 0.8 });
      break;
    }
    case "wardrobe": {
      // Lemari kayu dua pintu -- dekorasi murni, terinspirasi referensi
      // lemari kayu gaya retro 8-bit yang dikirim Owner.
      chunkyRect(ctx, r.x, r.y, r.w, r.h, "#7c5a3a", { radius: 2 });
      const doorGap = 2;
      const doorW = (r.w - 8 - doorGap) / 2;
      chunkyRect(ctx, r.x + 4, r.y + 4, doorW, r.h - 8, "#5c3b1e", { shadow: false, radius: 1.5 });
      chunkyRect(ctx, r.x + 4 + doorW + doorGap, r.y + 4, doorW, r.h - 8, "#5c3b1e", { shadow: false, radius: 1.5 });
      // Trim kuningan tipis di atas + serat kayu vertikal halus di tiap
      // pintu -- biar nggak kelihatan cuma 2 kotak coklat polos.
      chunkyRect(ctx, r.x + 3, r.y + 1.5, r.w - 6, 1.6, "#d4a24c", { shadow: false, radius: 0.5, opacity: 0.8 });
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 4 + doorW * 0.5, r.y + 6);
      ctx.lineTo(r.x + 4 + doorW * 0.5, r.y + r.h - 6);
      ctx.moveTo(r.x + 4 + doorW + doorGap + doorW * 0.5, r.y + 6);
      ctx.lineTo(r.x + 4 + doorW + doorGap + doorW * 0.5, r.y + r.h - 6);
      ctx.stroke();
      ctx.restore();
      chunkyCircle(ctx, r.x + 4 + doorW - 3, cy, 1.4, "#d4a24c", { shadow: false });
      chunkyCircle(ctx, r.x + 4 + doorW + doorGap + 3, cy, 1.4, "#d4a24c", { shadow: false });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    }
    case "ringlight": {
      // Ring light sudut studio konten (Ruang Creative) -- bukan niru
      // alat asli, cuma siluet umum sebuah ring light di atas tripod
      // kecil: ide dari video referensi Owner (5 Okt 2026), digambar
      // 100% prosedural ala chunky pixel-art, bukan ditiru/jiplak visualnya.
      const standW = Math.max(2, r.w * 0.18);
      chunkyRect(ctx, cx - standW / 2, cy + r.h * 0.1, standW, r.h * 0.42, "#44403c", { shadow: false, radius: 1 });
      chunkyCircle(ctx, cx, r.y + r.h * 0.32, r.w * 0.46, "#fef3c7", { glow: "#fde68a" });
      chunkyCircle(ctx, cx, r.y + r.h * 0.32, r.w * 0.22, "#78350f", { shadow: false });
      break;
    }
    case "camtripod": {
      // Kamera di atas tripod kaki tiga -- pelengkap sudut studio konten
      // di samping ring light & meja kecil "KONTEN".
      for (const dx of [-1, 0, 1]) {
        ctx.save();
        ctx.strokeStyle = "#44403c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy + r.h * 0.1);
        ctx.lineTo(cx + dx * r.w * 0.38, r.y + r.h);
        ctx.stroke();
        ctx.restore();
      }
      chunkyRect(ctx, r.x + r.w * 0.18, r.y, r.w * 0.64, r.h * 0.5, "#1f2937", { radius: 1.5 });
      chunkyCircle(ctx, cx, r.y + r.h * 0.25, r.w * 0.18, "#0f172a", { shadow: false, glow: "#38bdf8" });
      break;
    }
    case "bonfire": {
      const radius = Math.min(r.w, r.h) / 2;
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        chunkyCircle(ctx, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 4, "#57534e", { shadow: false });
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 5);
      chunkyRect(ctx, -radius * 0.7, -2.2, radius * 1.4, 4.4, "#78350f", { shadow: false, radius: 2 });
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      chunkyRect(ctx, -radius * 0.7, -2.2, radius * 1.4, 4.4, "#5c3b1e", { shadow: false, radius: 2 });
      ctx.restore();

      // Nyala api berkedip (Date.now()) -- satu-satunya efek bergerak di
      // peta selain avatar, sengaja dibuat hidup supaya terasa "game".
      const flicker = 0.85 + Math.sin(now / 90) * 0.1 + Math.sin(now / 37) * 0.05;
      ctx.save();
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 22;
      const outer = ctx.createRadialGradient(cx, cy - radius * 0.3, 0, cx, cy - radius * 0.1, radius * 0.8 * flicker);
      outer.addColorStop(0, "#fde047");
      outer.addColorStop(0.5, "#f97316");
      outer.addColorStop(1, "rgba(249,115,22,0)");
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.ellipse(cx, cy - radius * 0.25, radius * 0.75 * flicker, radius * 1.05 * flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      chunkyCircle(ctx, cx, cy - radius * 0.1, radius * 0.4 * flicker, "#fde047", { shadow: false, glow: "#facc15" });
      if (item.label) outlinedText(ctx, item.label, cx, r.y - 6, { size: 8 });
      break;
    }
    default:
      break;
  }
}

/**
 * Highlight perabot yang bisa diinteraksi saat avatar sendiri mendekat --
 * outline kuning berdenyut + ikon pose (POSE_EMOJI dari VirtualOfficeClient,
 * dikirim via parameter `emoji` biar HouseScene tidak perlu tahu soal
 * InteractionKind) yang mengambang pelan di atasnya. Dipanggil terakhir
 * dari loop gambar (setelah semua Sortable), supaya selalu tampil di atas
 * avatar/perabot lain -- permintaan Owner: perabot interaktif harus
 * kelihatan jelas sebelum diklik, bukan cuma tombol di bawah layar. */
export function drawInteractHint(ctx: CanvasRenderingContext2D, item: Furniture, emoji: string, now: number): void {
  const { x, y, w, h } = item.rect;
  const pulse = 0.55 + Math.sin(now / 260) * 0.35;
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, pulse);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fbbf24";
  ctx.shadowColor = "#fbbf24";
  ctx.shadowBlur = 10;
  roundRectPath(ctx, x - 4, y - 4, w + 8, h + 8, 8);
  ctx.stroke();
  ctx.restore();

  const bob = Math.sin(now / 320) * 3;
  outlinedText(ctx, emoji, x + w / 2, y - 14 + bob, { size: 15, stroke: false });
}
