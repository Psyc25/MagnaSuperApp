import { describe, expect, it } from "vitest";
import { calculateBookingTotal, calculateUnitPrice, countDaysInclusive } from "./pricing";
import type { InventoryItem } from "./types";

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "item-1",
  name: "Sound System",
  category: "Audio",
  location: "Gudang",
  pricePerDay: 100_000,
  totalUnit: 5,
  unitMaintenance: 0,
  ...over,
});

describe("countDaysInclusive", () => {
  it("menghitung tanggal mulai & selesai (10-12 = 3 hari)", () => {
    expect(countDaysInclusive("2026-09-10", "2026-09-12")).toBe(3);
  });
  it("sewa satu hari = 1", () => {
    expect(countDaysInclusive("2026-09-10", "2026-09-10")).toBe(1);
  });
  it("melewati akhir bulan & tahun kabisat", () => {
    expect(countDaysInclusive("2028-02-28", "2028-03-01")).toBe(3);
    expect(countDaysInclusive("2026-12-31", "2027-01-01")).toBe(2);
  });
  it("tanggal terbalik tidak pernah menghasilkan 0 atau negatif", () => {
    expect(countDaysInclusive("2026-09-12", "2026-09-10")).toBe(1);
  });
});

describe("calculateUnitPrice", () => {
  it("tanpa harga mingguan/bulanan = harga harian x hari", () => {
    expect(calculateUnitPrice(item(), 10)).toBe(1_000_000);
  });
  it("blok 7 hari pakai harga mingguan, sisanya harian", () => {
    expect(calculateUnitPrice(item({ pricePerWeek: 500_000 }), 9)).toBe(500_000 + 2 * 100_000);
  });
  it("blok 30 hari pakai harga bulanan dulu, lalu mingguan, lalu harian", () => {
    const priced = item({ pricePerWeek: 500_000, pricePerMonth: 1_800_000 });
    expect(calculateUnitPrice(priced, 39)).toBe(1_800_000 + 500_000 + 2 * 100_000);
  });
  it("kurang dari 7 hari tidak memakai harga mingguan", () => {
    expect(calculateUnitPrice(item({ pricePerWeek: 500_000 }), 6)).toBe(600_000);
  });
});

describe("calculateBookingTotal", () => {
  it("harga per unit x jumlah unit", () => {
    const total = calculateBookingTotal(
      { tanggalMulai: "2026-09-10", tanggalSelesai: "2026-09-12", jumlahUnit: 2 },
      item()
    );
    expect(total).toBe(3 * 100_000 * 2);
  });
  it("alat tidak ditemukan = 0", () => {
    expect(
      calculateBookingTotal({ tanggalMulai: "2026-09-10", tanggalSelesai: "2026-09-12", jumlahUnit: 2 }, undefined)
    ).toBe(0);
  });
});
