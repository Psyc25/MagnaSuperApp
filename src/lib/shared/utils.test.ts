import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDateInJakarta, isoDaysFromNow, todayISO } from "./utils";

afterEach(() => {
  vi.useRealTimers();
});

describe("tanggal menurut WIB", () => {
  it("jam 00:00-06:59 WIB sudah dihitung hari berikutnya walau server UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T18:30:00Z")); // 06 Okt 01:30 WIB
    expect(todayISO()).toBe("2026-10-06");
  });
  it("siang hari WIB sama dengan tanggal UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T05:00:00Z")); // 12:00 WIB
    expect(todayISO()).toBe("2026-10-05");
  });
  it("isoDaysFromNow ikut kalender WIB", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:30:00Z")); // 01 Jan 2027 00:30 WIB
    expect(isoDaysFromNow(0)).toBe("2027-01-01");
    expect(isoDaysFromNow(7)).toBe("2027-01-08");
  });
});

describe("isoDateInJakarta", () => {
  it("timestamp 22:30 UTC = keesokan harinya di WIB", () => {
    expect(isoDateInJakarta("2026-10-05T22:30:00+00:00")).toBe("2026-10-06");
  });
  it("timestamp siang tetap di tanggal yang sama", () => {
    expect(isoDateInJakarta("2026-10-05T03:00:00Z")).toBe("2026-10-05");
  });
});
