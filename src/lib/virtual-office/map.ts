import type { Division } from "@/lib/supabase/types";

/**
 * Tahap H (modul baru) -- "Kantor Virtual": peta kantor 2D ala Gather.town
 * (avatar jalan-jalan pakai WASD/panah, bisa lihat siapa sedang online &
 * di ruangan mana). File ini SENGAJA murni data + logika geometri, tanpa
 * React/canvas sama sekali -- supaya bisa dites/dibaca lepas dari
 * VirtualOfficeClient.tsx yang isinya render loop.
 *
 * Layout: grid 3 kolom x 2 baris, tiap sel 260x270, dipisahkan koridor
 * 40px yang bisa dilewati bebas (space kosong ANTARA sel, bukan tembok) --
 * spawn point staf persis di perempatan koridor tengah.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type OfficeRoom = {
  id: string;
  label: string;
  rect: Rect;
  /** Warna lantai (tint tipis, dipakai fillStyle langsung -- canvas modern
   * terima hex 8-digit RRGGBBAA). */
  floorColor: string;
  /** Warna aksen (garis tepi ruangan + dipakai juga sebagai warna avatar
   * kalau ruangan ini "milik" satu divisi). */
  accentColor: string;
  /** null = ruangan netral (Meeting/Pantry), bukan milik satu divisi. */
  division: Division | null;
};

export const WORLD_W = 900;
export const WORLD_H = 620;
/** Margin tembok luar -- pusat avatar tidak boleh melewati batas ini. */
const WALL_MARGIN = 20;

/** Lebar area "taman" di luar gedung (Tahap 3D) -- murni dekorasi latar
 * (rumput + pohon keliling), avatar TIDAK PERNAH sampai situ karena
 * `resolveMove` tetap membatasi gerak ke dalam WORLD_W x WORLD_H seperti
 * semula. */
export const OUTDOOR_MARGIN = 140;

export const PLAYER_RADIUS = 14;
/** Piksel per detik -- dipakai VirtualOfficeClient dikali delta-time frame,
 * BUKAN dikali langsung per-frame, supaya kecepatan gerak konsisten walau
 * frame rate perangkat beda-beda. */
export const PLAYER_SPEED = 190;

export const SPAWN = { x: 450, y: 310 };

/** Warna avatar per divisi -- dipisah dari DIVISION_BADGE_CLASSES di
 * supabase/types.ts karena itu class Tailwind (tidak bisa dipakai langsung
 * sebagai `ctx.fillStyle` di canvas), sedangkan di sini butuh hex asli. */
export const DIVISION_COLORS: Record<Division, string> = {
  magnarent: "#0ea5e9",
  magnative: "#d946ef",
  production: "#10b981",
  all: "#8b5cf6",
  investor: "#f59e0b",
  finance: "#14b8a6",
};

const COL1_X = 20;
const COL2_X = 320;
const COL3_X = 620;
const ROW1_Y = 20;
const ROW2_Y = 330;
const ROOM_W = 260;
const ROOM_H = 270;

export const ROOMS: OfficeRoom[] = [
  {
    id: "magnarent-desk",
    label: "Magnarent Office",
    rect: { x: COL1_X, y: ROW1_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#e0f2fe60", // Light blue corporate
    accentColor: "#0284c7",
    division: "magnarent",
  },
  {
    id: "magnativ-desk",
    label: "Magnative Studio",
    rect: { x: COL2_X, y: ROW1_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#fae8ff60", // Light purple corporate
    accentColor: "#a855f7",
    division: "magnative",
  },
  {
    id: "production-desk",
    label: "Production Workshop",
    rect: { x: COL3_X, y: ROW1_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#dcfce760", // Light green corporate
    accentColor: "#16a34a",
    division: "production",
  },
  {
    id: "meeting-room",
    label: "Conference Room",
    rect: { x: COL1_X, y: ROW2_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#f1f5f960", // Light gray corporate
    accentColor: "#475569",
    division: null,
  },
  {
    id: "pantry",
    label: "Lounge & Pantry",
    rect: { x: COL2_X, y: ROW2_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#fef3c760", // Warm cream
    accentColor: "#d97706",
    division: null,
  },
  {
    id: "owner-room",
    label: "Executive Suite",
    rect: { x: COL3_X, y: ROW2_Y, w: ROOM_W, h: ROOM_H },
    floorColor: "#ede9fe60", // Soft violet corporate
    accentColor: "#7c3aed",
    division: "all",
  },
];

/** Obstacle (meja/meja-rapat/counter) -- INI yang benar-benar menghalangi
 * jalan avatar (bukan batas ruangan itu sendiri, yang cuma visual/label).
 * Dibuat manual per ruangan (bukan loop generik) supaya posisinya jelas
 * dibaca & mudah diubah tanpa harus bongkar rumus. */
export const OBSTACLES: Rect[] = [
  // 3 meja kerja tiap ruang divisi (60x30, jarak 20px, dipusatkan)
  ...(["magnarent-desk", "magnativ-desk", "production-desk"] as const).flatMap((roomId) => {
    const room = ROOMS.find((r) => r.id === roomId)!;
    const deskY = room.rect.y + 120;
    return [0, 1, 2].map((i) => ({
      x: room.rect.x + 20 + i * 80,
      y: deskY,
      w: 60,
      h: 30,
    }));
  }),
  // Meja rapat besar di tengah Ruang Meeting
  { x: COL1_X + 60, y: ROW2_Y + 90, w: 140, h: 90 },
  // Counter pantry menempel dinding atas
  { x: COL2_X + 20, y: ROW2_Y + 20, w: 220, h: 40 },
  // Meja kerja Owner/Admin, satu meja besar
  { x: COL3_X + 70, y: ROW2_Y + 40, w: 120, h: 50 },
];

/**
 * Perabot/dekorasi (Tahap 3D, permintaan Owner: "pepohonan dan isi
 * kantor") -- BEDA dari `OBSTACLES` di atas: murni VISUAL, TIDAK
 * menghalangi jalan avatar (`resolveMove` tidak membaca array ini sama
 * sekali). Meja kerja/meja rapat/counter yang MEMANG menghalangi jalan
 * sudah ada sendiri di `OBSTACLES` -- dirender sebagai kotak meja di
 * VirtualOfficeClient, array ini cuma menambah detail DI ATAS/DI SEKITAR
 * posisi itu (komputer di atas meja, kursi di sisi meja, dst).
 */
export type PropType =
  | "chair"
  | "computer"
  | "meetingChair"
  | "fridge"
  | "dispenser"
  | "cabinet"
  | "tree"
  | "bush"
  // -- Dekorasi KHAS tiap ruangan (permintaan Owner: ruangan lebih "niat"
  // & beda identitas per divisi, terinspirasi referensi video game RPG
  // top-down) -- tetap primitif geometri, TANPA aset gambar/sprite. --
  | "crate" // tumpukan kotak inventaris -- Magnarent (sewa alat)
  | "rack" // rak terbuka -- Magnarent
  | "moodboard" // papan mood/foto tertempel -- Magnativ (kreatif)
  | "ringlight" // ring light + tripod -- Magnativ
  | "ladder" // tangga lipat -- Production
  | "planks" // tumpukan papan kayu -- Production
  | "tv" // TV di kaki penyangga -- Ruang Meeting
  | "whiteboard" // papan tulis -- Ruang Meeting
  | "stool" // kursi bar pendek -- Pantry
  | "microwave" // microwave -- Pantry
  | "bookshelf" // rak buku -- Ruang Owner/Admin
  | "sofa" // sofa santai -- Ruang Owner/Admin
  | "bench" // bangku taman -- halaman luar
  | "lamppost" // lampu taman -- halaman luar
  | "pottedplant"; // tanaman pot -- halaman luar

export type Prop = { id: string; type: PropType; x: number; y: number };

export const PROPS: Prop[] = [
  // Komputer di atas + kursi di sisi tiap meja kerja divisi (posisi
  // mengikuti persis meja di OBSTACLES: 60x30, dipusatkan y+120).
  ...(["magnarent-desk", "magnativ-desk", "production-desk"] as const).flatMap((roomId) => {
    const room = ROOMS.find((r) => r.id === roomId)!;
    const deskY = room.rect.y + 120;
    return [0, 1, 2].flatMap((i) => {
      const deskCenterX = room.rect.x + 20 + i * 80 + 30;
      return [
        { id: `${roomId}-computer-${i}`, type: "computer" as const, x: deskCenterX, y: deskY + 12 },
        { id: `${roomId}-chair-${i}`, type: "chair" as const, x: deskCenterX, y: deskY + 50 },
      ];
    });
  }),

  // 6 kursi keliling meja rapat (meja rapat di OBSTACLES: COL1_X+60,
  // ROW2_Y+90, 140x90 -- 3 kursi di sisi atas, 3 di sisi bawah).
  ...[0, 1, 2].flatMap((i) => [
    { id: `meeting-chair-top-${i}`, type: "meetingChair" as const, x: COL1_X + 85 + i * 45, y: ROW2_Y + 78 },
    { id: `meeting-chair-bottom-${i}`, type: "meetingChair" as const, x: COL1_X + 85 + i * 45, y: ROW2_Y + 192 },
  ]),

  // Pantry: kulkas + dispenser di dekat counter (counter di OBSTACLES:
  // COL2_X+20, ROW2_Y+20, 220x40).
  { id: "pantry-fridge", type: "fridge", x: COL2_X + 245, y: ROW2_Y + 40 },
  { id: "pantry-dispenser", type: "dispenser", x: COL2_X + 30, y: ROW2_Y + 40 },

  // Lemari arsip di Ruang Owner/Admin (meja di OBSTACLES: COL3_X+70,
  // ROW2_Y+40, 120x50).
  { id: "owner-cabinet", type: "cabinet", x: COL3_X + 230, y: ROW2_Y + 40 },

  // Beberapa semak kecil di sudut tiap ruangan (sentuhan hijau di dalam
  // gedung, tidak menghalangi jalan) + pohon KELILING gedung di area
  // taman luar (OUTDOOR_MARGIN) yang tidak pernah dilewati avatar.
  ...ROOMS.map((room) => ({
    id: `${room.id}-bush`,
    type: "bush" as const,
    x: room.rect.x + room.rect.w - 18,
    y: room.rect.y + 18,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `tree-north-${i}`,
    type: "tree" as const,
    x: 40 + i * 165,
    y: -OUTDOOR_MARGIN / 2,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `tree-south-${i}`,
    type: "tree" as const,
    x: 40 + i * 165,
    y: WORLD_H + OUTDOOR_MARGIN / 2,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `tree-west-${i}`,
    type: "tree" as const,
    x: -OUTDOOR_MARGIN / 2,
    y: 40 + i * 180,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `tree-east-${i}`,
    type: "tree" as const,
    x: WORLD_W + OUTDOOR_MARGIN / 2,
    y: 40 + i * 180,
  })),

  // Dekorasi KHAS tiap ruangan -- biar tiap divisi kerasa beda identitas
  // (bukan cuma beda warna lantai), terinspirasi referensi video Owner:
  // ruangan RPG top-down yang tiap sudutnya "niat" didekor.
  { id: "magnarent-crate", type: "crate", x: COL1_X + 230, y: ROW1_Y + 40 },
  { id: "magnarent-rack", type: "rack", x: COL1_X + 20, y: ROW1_Y + 20 },
  { id: "magnativ-ringlight", type: "ringlight", x: COL2_X + 230, y: ROW1_Y + 240 },
  { id: "magnativ-moodboard", type: "moodboard", x: COL2_X + 20, y: ROW1_Y + 20 },
  { id: "production-ladder", type: "ladder", x: COL3_X + 230, y: ROW1_Y + 240 },
  { id: "production-planks", type: "planks", x: COL3_X + 20, y: ROW1_Y + 240 },
  { id: "meeting-tv", type: "tv", x: COL1_X + 130, y: ROW2_Y + 20 },
  { id: "meeting-whiteboard", type: "whiteboard", x: COL1_X + 20, y: ROW2_Y + 240 },
  { id: "pantry-stool-1", type: "stool", x: COL2_X + 120, y: ROW2_Y + 90 },
  { id: "pantry-stool-2", type: "stool", x: COL2_X + 160, y: ROW2_Y + 90 },
  { id: "pantry-microwave", type: "microwave", x: COL2_X + 190, y: ROW2_Y + 20 },
  { id: "owner-bookshelf", type: "bookshelf", x: COL3_X + 20, y: ROW2_Y + 20 },
  { id: "owner-sofa", type: "sofa", x: COL3_X + 230, y: ROW2_Y + 220 },

  // Halaman/taman depan -- bangku, lampu taman & tanaman pot (selain
  // pohon keliling yang sudah ada di atas), dikelompokkan di sisi utara
  // supaya kerasa ada "teras/courtyard" seperti referensi video.
  { id: "courtyard-bench-1", type: "bench", x: 120, y: -OUTDOOR_MARGIN / 2 + 55 },
  { id: "courtyard-bench-2", type: "bench", x: 450, y: -OUTDOOR_MARGIN / 2 + 55 },
  { id: "courtyard-bench-3", type: "bench", x: 780, y: -OUTDOOR_MARGIN / 2 + 55 },
  { id: "courtyard-lamppost-1", type: "lamppost", x: 280, y: -OUTDOOR_MARGIN / 2 + 55 },
  { id: "courtyard-lamppost-2", type: "lamppost", x: 610, y: -OUTDOOR_MARGIN / 2 + 55 },
  { id: "courtyard-pottedplant-1", type: "pottedplant", x: 30, y: -OUTDOOR_MARGIN / 2 + 20 },
  { id: "courtyard-pottedplant-2", type: "pottedplant", x: 870, y: -OUTDOOR_MARGIN / 2 + 20 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Lingkaran (posisi avatar) vs kotak (obstacle) -- pendekatan standar:
 * cari titik terdekat di kotak dari pusat lingkaran, lalu cek jaraknya. */
function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function collidesWithObstacle(x: number, y: number): boolean {
  return OBSTACLES.some((rect) => circleRectOverlap(x, y, PLAYER_RADIUS, rect));
}

/** Gerak avatar dengan collision sliding per-sumbu -- coba geser X dulu
 * (batalkan kalau nabrak), lalu Y dari hasil X (batalkan kalau nabrak) --
 * ini yang bikin avatar "mepet" tergelincir di tepi meja/tembok, bukan
 * berhenti total begitu nabrak satu sudut. */
export function resolveMove(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  const minX = WALL_MARGIN + PLAYER_RADIUS;
  const maxX = WORLD_W - WALL_MARGIN - PLAYER_RADIUS;
  const minY = WALL_MARGIN + PLAYER_RADIUS;
  const maxY = WORLD_H - WALL_MARGIN - PLAYER_RADIUS;

  let nx = clamp(x + dx, minX, maxX);
  if (collidesWithObstacle(nx, y)) nx = x;

  let ny = clamp(y + dy, minY, maxY);
  if (collidesWithObstacle(nx, ny)) ny = y;

  return { x: nx, y: ny };
}

/** Label ruangan tempat titik (x,y) berada, atau "Koridor" kalau di
 * lorong antar-ruangan -- dipakai untuk banner "Kamu sekarang di: ...". */
export function getRoomAt(x: number, y: number): OfficeRoom | null {
  return (
    ROOMS.find(
      (r) => x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h
    ) ?? null
  );
}

/**
 * AI Agent NPC positions — setiap agent duduk di ruangan sesuai spesialisasinya.
 * Koordinat adalah posisi di peta 2D (sama seperti SPAWN, PROPS, dll).
 */
export type AgentNPCPosition = {
  agentId: string;
  x: number;
  y: number;
  roomId: string;
};

export const AGENT_NPC_POSITIONS: AgentNPCPosition[] = [
  // NOVA: di koridor pusat (general assistant, accessible to all)
  { agentId: "nova", x: 450, y: 260, roomId: "corridor" },
  // RENO: di Meja Magnarent (rental specialist)
  { agentId: "reno", x: COL1_X + 200, y: ROW1_Y + 60, roomId: "magnarent-desk" },
  // CREA: di Meja Magnativ (creative partner)
  { agentId: "crea", x: COL2_X + 200, y: ROW1_Y + 60, roomId: "magnativ-desk" },
  // FABR: di Meja Production (production expert)
  { agentId: "fabr", x: COL3_X + 200, y: ROW1_Y + 60, roomId: "production-desk" },
  // FINN: di Ruang Owner/Admin (finance analyst)
  { agentId: "finn", x: COL3_X + 200, y: ROW2_Y + 180, roomId: "owner-room" },
];
