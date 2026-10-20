import { describe, expect, it } from "vitest";
import {
  FLOOR2_ARRIVAL,
  GROUND_ARRIVAL,
  OWNER_ROOM_USER_IDS,
  SLEEP_SLOTS,
  SPAWN,
  blockersFor,
  canEnterOwnerRoom,
  chatRoomFor,
  describeRoomActivity,
  getRoomAt,
  resolveMove,
  sleepSlot,
  stairsTeleport,
  type Pos,
} from "./house";

const OWNER = OWNER_ROOM_USER_IDS[0];
const STAFF = "00000000-0000-0000-0000-000000000001";

/** Jalan lurus dalam langkah kecil (seperti game loop) lalu kembalikan posisi akhir. */
function walk(from: Pos, to: Pos, userId: string, steps = 400): Pos {
  let pos = { ...from };
  const blockers = blockersFor(userId);
  for (let i = 0; i < steps; i += 1) {
    const dx = to.x - pos.x;
    const dy = to.y - pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) break;
    pos = resolveMove(pos, (dx / len) * 3, (dy / len) * 3, blockers);
  }
  return pos;
}

function walkPath(points: Pos[], userId: string): Pos {
  let pos = points[0];
  for (const p of points.slice(1)) pos = walk(pos, p, userId);
  return pos;
}

describe("Rumah Magna: denah", () => {
  it("muncul di halaman depan dekat gerbang", () => {
    expect(getRoomAt(SPAWN.x, SPAWN.y)?.id).toBe("halamandepan");
  });

  it("gerbang -> pintu utama -> Ruang Depan -> lorong tengah -> Dapur", () => {
    const end = walkPath(
      [SPAWN, { x: 450, y: 820 }, { x: 450, y: 660 }, { x: 450, y: 440 }],
      STAFF
    );
    expect(getRoomAt(end.x, end.y)?.id).toBe("dapur");
  });

  it("tembok menahan: tidak bisa menembus dari lorong ke Ruang Creative di luar pintu", () => {
    const end = walk({ x: 450, y: 600 }, { x: 200, y: 600 }, STAFF);
    expect(getRoomAt(end.x, end.y)?.id).not.toBe("creative");
  });

  it("pintu samping lorong ke Ruang Creative bisa dilewati", () => {
    const end = walk({ x: 450, y: 670 }, { x: 200, y: 670 }, STAFF);
    expect(getRoomAt(end.x, end.y)?.id).toBe("creative");
  });

  it("pintu Kamar Staff dan Ruang Gabungan berhadapan di ujung lorong", () => {
    const staff = walkPath([{ x: 450, y: 660 }, { x: 450, y: 551 }, { x: 250, y: 551 }], STAFF);
    expect(getRoomAt(staff.x, staff.y)?.id).toBe("staff");
    const gab = walkPath([{ x: 450, y: 660 }, { x: 450, y: 551 }, { x: 660, y: 551 }], STAFF);
    expect(getRoomAt(gab.x, gab.y)?.id).toBe("gabungan");
  });
});

describe("Kamar Owner", () => {
  it("hanya akun Owner yang boleh masuk", () => {
    expect(canEnterOwnerRoom(OWNER)).toBe(true);
    expect(canEnterOwnerRoom(STAFF)).toBe(false);
  });

  it("staf tertahan di pintu, Owner bisa masuk", () => {
    const route = [{ x: 450, y: 670 }, { x: 700, y: 670 }];
    const staff = walkPath(route, STAFF);
    expect(getRoomAt(staff.x, staff.y)?.id).toBe("lorong");
    const owner = walkPath(route, OWNER);
    expect(getRoomAt(owner.x, owner.y)?.id).toBe("owner");
  });
});

describe("Tangga ke gudang", () => {
  it("naik dari sela Kamar Staff dan Dapur, turun lagi ke ujung lorong", () => {
    const atStairs = walkPath([{ x: 450, y: 551 }, { x: 320, y: 551 }, { x: 320, y: 380 }], STAFF);
    const up = stairsTeleport(atStairs);
    expect(up).toEqual(FLOOR2_ARRIVAL);
    expect(getRoomAt(up!.x, up!.y)?.id).toBe("gudang");
    expect(stairsTeleport({ x: 1230, y: 470 })).toEqual(GROUND_ARRIVAL);
    expect(stairsTeleport(GROUND_ARRIVAL)).toBeNull();
    expect(stairsTeleport(FLOOR2_ARRIVAL)).toBeNull();
  });
});

describe("Kamar Staff", () => {
  it("24 tempat tidur di dalam Kamar Staff, bawah dulu baru atas", () => {
    expect(SLEEP_SLOTS).toBe(24);
    for (let i = 0; i < SLEEP_SLOTS; i += 1) {
      const slot = sleepSlot(i)!;
      expect(getRoomAt(slot.x, slot.y)?.id).toBe("staff");
    }
    expect(sleepSlot(0)!.level).toBe(0);
    expect(sleepSlot(12)!.level).toBe(1);
    expect(sleepSlot(24)).toBeNull();
  });
});

describe("chat ruangan", () => {
  it("Ruang Creative membuka chat Magnativ hanya untuk yang berhak", () => {
    expect(chatRoomFor("creative", "magnative")).toBe("magnative");
    expect(chatRoomFor("creative", "magnarent")).toBeNull();
    expect(chatRoomFor("creative", "all")).toBe("magnative");
  });

  it("Dapur = chat bersama, investor tidak punya chat", () => {
    expect(chatRoomFor("dapur", "finance")).toBe("bersama");
    expect(chatRoomFor("dapur", "investor")).toBeNull();
  });

  it("Ruang Gabungan mengikuti divisi", () => {
    expect(chatRoomFor("gabungan", "production")).toBe("production");
    expect(chatRoomFor("gabungan", "finance")).toBe("bersama");
  });
});

describe("describeRoomActivity (status ruangan, Okt 2026: room identity)", () => {
  it("kosong atau sendirian = sepi", () => {
    expect(describeRoomActivity("kerja", 0, false, false)).toBe("sepi");
    expect(describeRoomActivity("kerja", 1, false, false)).toBe("sepi");
  });

  it("dua orang atau lebih = aktif", () => {
    expect(describeRoomActivity("creative", 2, false, false)).toBe("aktif");
  });

  it("ruang kind meeting + ada status meeting + 2+ orang = meeting", () => {
    expect(describeRoomActivity("meeting", 2, true, false)).toBe("meeting");
    // Bukan ruang meeting -> tetap "aktif" walau ada yang status meeting.
    expect(describeRoomActivity("kerja", 2, true, false)).toBe("aktif");
    // Ruang meeting tapi sendirian -> belum dianggap "meeting" beneran.
    expect(describeRoomActivity("meeting", 1, true, false)).toBe("sepi");
  });

  it("urgent menang dari semua status lain", () => {
    expect(describeRoomActivity("meeting", 5, true, true)).toBe("urgent");
    expect(describeRoomActivity("kerja", 1, false, true)).toBe("urgent");
  });
});
