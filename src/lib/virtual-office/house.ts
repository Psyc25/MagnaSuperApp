import type { ChatRoom } from "@/lib/chat/rooms";
import { availableChatRooms } from "@/lib/chat/rooms";
import type { Division } from "@/lib/supabase/types";

/**
 * Kantor Virtual v4 -- "Rumah Magna". Denah final dari Owner (6 Okt 2026):
 * kantor nyata lebih mirip rumah basecamp, jadi peta dibuat sebagai rumah:
 * gerbang -> halaman depan -> pintu utama -> Ruang Depan (kosong, 2 jendela)
 * -> lorong tengah (pajangan) dengan Ruang Creative di kiri dan Kamar Owner
 * di kanan -> ujung lorong: pintu Kamar Staff dan Ruang Gabungan saling
 * berhadapan, Dapur lurus, tangga ke Gudang (lantai 2) di sela Kamar Staff
 * dan Dapur -> halaman belakang (Garasi + Tempat Barang Besar).
 *
 * Murni data + geometri (tanpa React/three) supaya bisa dites. Koordinat
 * 2D: x ke kanan, y ke BAWAH = ke arah depan rumah (gerbang di y besar).
 * Lantai 2 diletakkan terpisah di x >= FLOOR2_OFFSET_X; tangga memindahkan
 * avatar antar lantai (teleport), kamera mengikuti avatar.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Pos = { x: number; y: number };
/** Arah hadap avatar (dipakai render & broadcast posisi). Ditaruh di sini
 * (bukan di Avatars.tsx) supaya presence.ts/PresenceProvider bisa pakai
 * tanpa circular import dengan komponen React. */
export type Dir = "up" | "down" | "left" | "right";
export type RemotePos = { x: number; y: number; dir: Dir };

export const PLAYER_RADIUS = 12;
/** Satuan peta per detik (dikali delta-time, bukan per frame). */
export const PLAYER_SPEED = 170;
/** Pengali kecepatan saat tombol/tahan Shift (sprint) aktif. */
export const SPRINT_MULTIPLIER = 1.8;
export const WALL_THICKNESS = 8;
export const WALL_HEIGHT = 46;

/** Hanya akun ini yang boleh masuk Kamar Owner (permintaan Owner: hanya
 * @jasonmagna). Pakai ID, bukan nama panggilan -- nama panggilan bisa
 * diganti pemiliknya sendiri, jadi tidak boleh jadi kunci akses. */
export const OWNER_ROOM_USER_IDS: readonly string[] = ["6f1ee4c0-3d40-43bf-ac1f-b64002fd7bb5"];

export function canEnterOwnerRoom(userId: string): boolean {
  return OWNER_ROOM_USER_IDS.includes(userId);
}

export const GROUND_BOUNDS: Rect = { x: 40, y: 40, w: 820, h: 950 };
export const FLOOR2_OFFSET_X = 1100;
export const FLOOR2_BOUNDS: Rect = { x: 1160, y: 360, w: 780, h: 160 };

export const SPAWN: Pos = { x: 450, y: 950 };

export type RoomId =
  | "it"
  | "depan"
  | "lorong"
  | "creative"
  | "owner"
  | "staff"
  | "tangga"
  | "koridor"
  | "dapur"
  | "gabungan"
  | "garasi"
  | "barangbesar"
  | "belakang"
  | "halamandepan"
  | "gudang";

export type HouseRoom = {
  id: RoomId;
  label: string;
  rect: Rect;
  floor: string;
  /** Ditampilkan tertulis di lantai. */
  showLabel: boolean;
};

/** Urutan penting untuk getRoomAt: ruangan kecil di dalam ruangan lain
 * (Ruang IT di dalam Ruang Gabungan) harus lebih dulu. */
export const ROOMS: HouseRoom[] = [
  { id: "it", label: "Ruang IT", rect: { x: 740, y: 482, w: 100, h: 93 }, floor: "#2c4a66", showLabel: true },
  { id: "depan", label: "Ruang Depan", rect: { x: 300, y: 750, w: 300, h: 130 }, floor: "#5b5240", showLabel: true },
  { id: "lorong", label: "Lorong Tengah", rect: { x: 320, y: 575, w: 260, h: 175 }, floor: "#3f4547", showLabel: false },
  { id: "creative", label: "Ruang Tim Creative", rect: { x: 60, y: 575, w: 260, h: 175 }, floor: "#5a3550", showLabel: true },
  { id: "owner", label: "Kamar Owner", rect: { x: 580, y: 575, w: 260, h: 175 }, floor: "#6b5523", showLabel: true },
  { id: "staff", label: "Kamar Staff", rect: { x: 60, y: 360, w: 230, h: 215 }, floor: "#463d63", showLabel: true },
  { id: "tangga", label: "Tangga", rect: { x: 290, y: 360, w: 60, h: 165 }, floor: "#4a4f52", showLabel: false },
  { id: "koridor", label: "Ujung Lorong", rect: { x: 290, y: 525, w: 290, h: 50 }, floor: "#3f4547", showLabel: false },
  { id: "dapur", label: "Dapur", rect: { x: 350, y: 360, w: 230, h: 165 }, floor: "#6b4330", showLabel: true },
  { id: "gabungan", label: "Ruang Gabungan", rect: { x: 580, y: 360, w: 260, h: 215 }, floor: "#2b4760", showLabel: true },
  { id: "garasi", label: "Garasi", rect: { x: 70, y: 84, w: 330, h: 210 }, floor: "#4b4a46", showLabel: true },
  { id: "barangbesar", label: "Tempat Barang Besar", rect: { x: 500, y: 84, w: 330, h: 210 }, floor: "#4b4a46", showLabel: true },
  { id: "belakang", label: "Halaman Belakang", rect: { x: 40, y: 40, w: 820, h: 320 }, floor: "#2f5a2c", showLabel: false },
  { id: "halamandepan", label: "Halaman Depan", rect: { x: 40, y: 750, w: 820, h: 240 }, floor: "#2f5a2c", showLabel: false },
  { id: "gudang", label: "Gudang Alat & Barang (Lt. 2)", rect: FLOOR2_BOUNDS, floor: "#4b4a46", showLabel: true },
];

const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));
export function getRoom(id: RoomId): HouseRoom {
  return ROOM_BY_ID.get(id)!;
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function getRoomAt(x: number, y: number): HouseRoom | null {
  return ROOMS.find((r) => inRect(x, y, r.rect)) ?? null;
}

/* ---------------------------- Tembok & pintu ---------------------------- */

type Gap = [number, number];

function splitByGaps(a: number, b: number, gaps: Gap[]): Gap[] {
  const segments: Gap[] = [];
  let cursor = a;
  for (const [g1, g2] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 > cursor) segments.push([cursor, g1]);
    cursor = Math.max(cursor, g2);
  }
  if (cursor < b) segments.push([cursor, b]);
  return segments;
}

function hWall(y: number, x1: number, x2: number, gaps: Gap[] = []): Rect[] {
  return splitByGaps(x1, x2, gaps).map(([a, b]) => ({
    x: a,
    y: y - WALL_THICKNESS / 2,
    w: b - a,
    h: WALL_THICKNESS,
  }));
}

function vWall(x: number, y1: number, y2: number, gaps: Gap[] = []): Rect[] {
  return splitByGaps(y1, y2, gaps).map(([a, b]) => ({
    x: x - WALL_THICKNESS / 2,
    y: a,
    w: WALL_THICKNESS,
    h: b - a,
  }));
}

/** Tembok rumah (dirender tinggi) -- celah = pintu. */
export const WALLS: Rect[] = [
  // Ruang Depan: pintu utama di tengah, jendela di kiri-kanannya (jendela
  // tetap tembok untuk tabrakan, digambar sebagai kaca).
  ...hWall(880, 300, 600, [[420, 480]]),
  ...vWall(300, 750, 880),
  ...vWall(600, 750, 880),
  // Batas depan rumah utama (pintu Ruang Depan -> lorong tengah).
  ...hWall(750, 60, 840, [[420, 480]]),
  ...vWall(60, 360, 750),
  ...vWall(840, 360, 750),
  // Tembok belakang (pintu belakang dari Dapur ke halaman).
  ...hWall(360, 60, 840, [[420, 480]]),
  // Ruang Creative | lorong | Kamar Owner (pintu samping saling berhadapan).
  ...vWall(320, 575, 750, [[640, 700]]),
  ...vWall(580, 575, 750, [[640, 700]]),
  // Baris depan dan baris belakang dipisah tembok, kecuali lorong tengah
  // yang terbuka ke ujung lorong.
  ...hWall(575, 60, 320),
  ...hWall(575, 580, 840),
  // Kamar Staff: pintu di pojok dekat Ruang Creative, menghadap ujung lorong.
  ...vWall(290, 360, 575, [[530, 572]]),
  // Tangga | Dapur.
  ...vWall(350, 360, 525),
  // Dapur -> ujung lorong.
  ...hWall(525, 350, 580, [[420, 480]]),
  // Ruang Gabungan: pintu di pojok dekat Kamar Owner, berhadapan dengan
  // pintu Kamar Staff.
  ...vWall(580, 360, 575, [[530, 572]]),
  // Ruang IT di pojok Ruang Gabungan.
  ...vWall(740, 482, 575, [[500, 540]]),
  ...hWall(482, 740, 840),
];

/** Bangunan di halaman belakang (dirender lebih rendah dari tembok rumah). */
export const OUTBUILDING_WALLS: Rect[] = [
  ...hWall(84, 70, 400),
  ...vWall(70, 84, 294),
  ...vWall(400, 84, 294),
  ...hWall(294, 70, 400, [[170, 310]]),
  ...hWall(84, 500, 830),
  ...vWall(500, 84, 294),
  ...vWall(830, 84, 294),
  ...hWall(294, 500, 830, [[600, 730]]),
];

/** Pagar depan dengan gerbang di tengah. */
export const FENCE: Rect[] = hWall(988, 40, 860, [[390, 510]]);

/** Pintu Kamar Owner -- tertutup untuk semua akun kecuali OWNER_ROOM_USER_IDS. */
export const OWNER_DOOR: Rect = { x: 580 - WALL_THICKNESS / 2, y: 640, w: WALL_THICKNESS, h: 60 };
export const OWNER_DOOR_CENTER: Pos = { x: 580, y: 670 };

/** Jendela di kiri-kanan pintu utama (visual). */
export const WINDOWS: Rect[] = [
  { x: 325, y: 876, w: 70, h: 8 },
  { x: 505, y: 876, w: 70, h: 8 },
];

/* ------------------------------- Perabot ------------------------------- */

export type FurnitureKind =
  | "bunkbed"
  | "bigtable"
  | "fridge"
  | "freezer"
  | "coffee"
  | "counter"
  | "desk"
  | "board"
  | "tv"
  | "bed"
  | "car"
  | "crate"
  | "rack"
  | "picnictable"
  | "bonfire"
  | "bench";

export type Furniture = { id: string; kind: FurnitureKind; rect: Rect; label?: string };

/** Kasur susun Kamar Staff: 3 kolom x 4 baris, lorong kosong di sisi kanan
 * dekat pintu. Tiap kasur 2 tingkat -> 24 tempat tidur. */
export const BUNK_BEDS: Rect[] = [0, 1, 2, 3].flatMap((row) =>
  [0, 1, 2].map((col) => ({ x: 70 + col * 56, y: 416 + row * 36, w: 50, h: 28 }))
);
export const BEDS_PER_BUNK = 2;
export const SLEEP_SLOTS = BUNK_BEDS.length * BEDS_PER_BUNK;

export const FURNITURE: Furniture[] = [
  ...BUNK_BEDS.map((rect, i) => ({ id: `bunk-${i}`, kind: "bunkbed" as const, rect })),
  // Ruang Creative: satu meja besar lebar di tengah.
  { id: "creative-table", kind: "bigtable", rect: { x: 105, y: 652, w: 170, h: 52 }, label: "MEJA BESAR" },
  // Dapur: kulkas, freezer, mesin kopi di dinding; meja melengkung dari
  // tembok kanan ke tengah (didekati dengan 3 potong).
  { id: "fridge", kind: "fridge", rect: { x: 470, y: 366, w: 30, h: 22 }, label: "KULKAS" },
  { id: "freezer", kind: "freezer", rect: { x: 504, y: 366, w: 30, h: 22 }, label: "FREEZER" },
  { id: "coffee", kind: "coffee", rect: { x: 540, y: 368, w: 24, h: 18 }, label: "KOPI" },
  { id: "counter-1", kind: "counter", rect: { x: 520, y: 447, w: 56, h: 16 } },
  { id: "counter-2", kind: "counter", rect: { x: 494, y: 456, w: 30, h: 18 } },
  { id: "counter-3", kind: "counter", rect: { x: 476, y: 472, w: 22, h: 32 } },
  // Ruang Gabungan: meja tiap tim mepet tembok, boardwall + TV dekat pintu.
  { id: "desk-rent", kind: "desk", rect: { x: 600, y: 368, w: 68, h: 18 }, label: "RENT" },
  { id: "desk-production", kind: "desk", rect: { x: 672, y: 368, w: 68, h: 18 }, label: "PRODUCTION" },
  { id: "desk-finance", kind: "desk", rect: { x: 744, y: 368, w: 88, h: 18 }, label: "FINANCE" },
  { id: "board", kind: "board", rect: { x: 586, y: 448, w: 6, h: 62 }, label: "BOARD" },
  { id: "tv", kind: "tv", rect: { x: 640, y: 456, w: 8, h: 44 }, label: "TV" },
  // Ruang IT.
  { id: "desk-it", kind: "desk", rect: { x: 770, y: 552, w: 60, h: 16 }, label: "IT" },
  // Kamar Owner.
  { id: "owner-bed", kind: "bed", rect: { x: 680, y: 660, w: 90, h: 60 } },
  // Garasi & tempat barang besar.
  { id: "car", kind: "car", rect: { x: 110, y: 120, w: 170, h: 80 } },
  { id: "big-1", kind: "crate", rect: { x: 540, y: 120, w: 90, h: 60 }, label: "BOOTH" },
  { id: "big-2", kind: "crate", rect: { x: 660, y: 110, w: 130, h: 70 }, label: "PROPERTI" },
  { id: "big-3", kind: "crate", rect: { x: 560, y: 210, w: 70, h: 40 }, label: "RIGGING" },
  // Gudang lantai 2.
  { id: "rack-1", kind: "rack", rect: { x: 1460, y: 440, w: 90, h: 56 } },
  { id: "rack-2", kind: "rack", rect: { x: 1570, y: 440, w: 90, h: 56 } },
  { id: "rack-3", kind: "rack", rect: { x: 1680, y: 440, w: 90, h: 56 } },
  // Spot santai di Halaman Depan (referensi: suasana piknik musim gugur) --
  // ditaruh di dua sisi gerbang, di luar jalur jalan tes "gerbang -> pintu
  // utama" (kolom x≈450) dan jauh dari lebar gerbang itu sendiri (x 390-510,
  // lihat FENCE) supaya tidak menghalangi lalu lintas utama.
  { id: "picnic-table", kind: "picnictable", rect: { x: 110, y: 905, w: 70, h: 34 }, label: "MEJA SANTAI" },
  { id: "bonfire", kind: "bonfire", rect: { x: 640, y: 905, w: 36, h: 36 }, label: "API UNGGUN" },
  { id: "bench-1", kind: "bench", rect: { x: 600, y: 946, w: 50, h: 12 } },
  { id: "bench-2", kind: "bench", rect: { x: 600, y: 886, w: 50, h: 12 } },
];

/** Pajangan lorong tengah (visual, tidak menghalangi). */
export const ARTWORKS = [
  { id: "art-magnativ", label: "MAGNATIV", color: "#d946ef", wall: "left" as const, x: 324, y: 612 },
  { id: "art-rent", label: "RENT", color: "#0ea5e9", wall: "left" as const, x: 324, y: 727 },
  { id: "art-production", label: "PRODUCTION", color: "#f59e0b", wall: "right" as const, x: 576, y: 612 },
];

export const SIGNS = [
  { id: "sign-creative", text: "← CREATIVE", x: 395, y: 668 },
  { id: "sign-owner", text: "OWNER →", x: 508, y: 668 },
  { id: "sign-dapur", text: "↑ DAPUR", x: 450, y: 600 },
];

/* ------------------------------ Tangga ------------------------------ */

/** Masuk zona ini di lantai 1 -> naik ke lantai 2, dan sebaliknya. */
export const STAIRS_UP_ZONE: Rect = { x: 290, y: 360, w: 60, h: 50 };
export const STAIRS_DOWN_ZONE: Rect = { x: 1184, y: 440, w: 100, h: 60 };
export const FLOOR2_ARRIVAL: Pos = { x: 1330, y: 470 };
export const GROUND_ARRIVAL: Pos = { x: 320, y: 552 };

export function isUpstairs(pos: Pos): boolean {
  return pos.x >= FLOOR2_OFFSET_X;
}

/** Kembalikan posisi baru kalau avatar menginjak zona tangga, atau null. */
export function stairsTeleport(pos: Pos): Pos | null {
  if (!isUpstairs(pos) && inRect(pos.x, pos.y, STAIRS_UP_ZONE)) return { ...FLOOR2_ARRIVAL };
  if (isUpstairs(pos) && inRect(pos.x, pos.y, STAIRS_DOWN_ZONE)) return { ...GROUND_ARRIVAL };
  return null;
}

/* ------------------------- Posisi "online di tempat lain" ------------------------- */

/** Titik berdiri untuk orang yang sedang membuka MagnaSuperApp (jadi
 * "online") tapi TIDAK sedang di halaman Kantor Virtual -- berdiri diam di
 * dekat meja divisinya di Ruang Gabungan/Ruang Creative, bukan ikut
 * berjalan (posisi live cuma ada kalau orangnya benar-benar di peta).
 * Dipakai VirtualOfficeClient untuk membedakan 3 keadaan: berjalan (live
 * di Kantor Virtual), diam di meja (online tapi di halaman lain), tidur di
 * Kamar Staff (aplikasi tertutup). */
export function deskForDivision(division: Division): Pos {
  switch (division) {
    case "magnarent":
      return { x: 634, y: 393 };
    case "production":
      return { x: 706, y: 393 };
    case "finance":
      return { x: 788, y: 393 };
    case "magnative":
      return { x: 190, y: 695 };
    default:
      // admin ("all") & investor: tidak punya meja divisi sendiri -> lorong tengah.
      return { x: 450, y: 660 };
  }
}

/* ------------------------------- NPC AI ------------------------------- */

export type AgentNPCPosition = { agentId: string; x: number; y: number; roomId: RoomId };

export const AGENT_NPC_POSITIONS: AgentNPCPosition[] = [
  { agentId: "nova", x: 525, y: 722, roomId: "lorong" },
  { agentId: "crea", x: 84, y: 728, roomId: "creative" },
  { agentId: "finn", x: 720, y: 520, roomId: "gabungan" },
  { agentId: "fabr", x: 340, y: 250, roomId: "garasi" },
  { agentId: "reno", x: 1860, y: 470, roomId: "gudang" },
];

/* ------------------------------ Tabrakan ------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

const STATIC_BLOCKERS: Rect[] = [
  ...WALLS,
  ...OUTBUILDING_WALLS,
  ...FENCE,
  ...FURNITURE.map((f) => f.rect),
];

export function blockersFor(userId: string): Rect[] {
  return canEnterOwnerRoom(userId) ? STATIC_BLOCKERS : [...STATIC_BLOCKERS, OWNER_DOOR];
}

function collides(x: number, y: number, blockers: Rect[]): boolean {
  return blockers.some((rect) => circleRectOverlap(x, y, PLAYER_RADIUS, rect));
}

/** Gerak dengan sliding per sumbu (tergelincir di tepi tembok, bukan
 * berhenti total), dibatasi area lantai tempat avatar berada. */
export function resolveMove(pos: Pos, dx: number, dy: number, blockers: Rect[]): Pos {
  const b = isUpstairs(pos) ? FLOOR2_BOUNDS : GROUND_BOUNDS;
  const minX = b.x + PLAYER_RADIUS;
  const maxX = b.x + b.w - PLAYER_RADIUS;
  const minY = b.y + PLAYER_RADIUS;
  const maxY = b.y + b.h - PLAYER_RADIUS;

  let nx = clamp(pos.x + dx, minX, maxX);
  if (collides(nx, pos.y, blockers)) nx = pos.x;
  let ny = clamp(pos.y + dy, minY, maxY);
  if (collides(nx, ny, blockers)) ny = pos.y;
  return { x: nx, y: ny };
}

/* ------------------------- Kamar Staff (offline) ------------------------- */

export type SleepSlot = { x: number; y: number; level: 0 | 1 };

/** Tempat tidur ke-i (0..SLEEP_SLOTS-1): tingkat bawah semua kasur dulu,
 * baru tingkat atas. */
export function sleepSlot(index: number): SleepSlot | null {
  if (index < 0 || index >= SLEEP_SLOTS) return null;
  const bed = BUNK_BEDS[index % BUNK_BEDS.length];
  const level = index < BUNK_BEDS.length ? 0 : 1;
  return { x: bed.x + bed.w / 2, y: bed.y + bed.h / 2, level };
}

/* ---------------------------- Chat ruangan ---------------------------- */

/** Ruang chat yang dibuka saat berada di ruangan tertentu, atau null. */
export function chatRoomFor(roomId: RoomId | undefined, division: Division): ChatRoom | null {
  const allowed = availableChatRooms(division);
  let room: ChatRoom | null = null;
  if (roomId === "creative") room = "magnative";
  else if (roomId === "dapur") room = "bersama";
  else if (roomId === "gabungan" || roomId === "it") {
    room = division === "magnarent" || division === "production" ? division : "bersama";
  }
  return room && allowed.includes(room) ? room : null;
}
