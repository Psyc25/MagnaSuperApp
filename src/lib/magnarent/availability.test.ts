import { describe, expect, it } from "vitest";
import { getAvailableUnitsInRange, getBookedUnitsInRange, rangesOverlap } from "./availability";
import type { Booking, InventoryItem } from "./types";

const item: InventoryItem = {
  id: "item-1",
  name: "LED Screen",
  category: "Visual",
  location: "Gudang",
  pricePerDay: 1_000_000,
  totalUnit: 4,
  unitMaintenance: 1,
};

let seq = 0;
const booking = (over: Partial<Booking>): Booking =>
  ({
    id: `b-${++seq}`,
    itemId: "item-1",
    namaKlien: "Klien",
    teleponKlien: "",
    tanggalMulai: "2026-10-10",
    tanggalSelesai: "2026-10-12",
    jumlahUnit: 1,
    status: "Dikonfirmasi",
    statusPembayaran: "Belum Bayar",
    dpAmount: 0,
    ...over,
  }) as Booking;

describe("rangesOverlap", () => {
  it("rentang yang bersentuhan di satu hari dianggap bentrok (inklusif)", () => {
    expect(rangesOverlap("2026-10-10", "2026-10-12", "2026-10-12", "2026-10-14")).toBe(true);
  });
  it("rentang berurutan tanpa hari yang sama tidak bentrok", () => {
    expect(rangesOverlap("2026-10-10", "2026-10-12", "2026-10-13", "2026-10-14")).toBe(false);
  });
  it("rentang yang membungkus rentang lain bentrok", () => {
    expect(rangesOverlap("2026-10-01", "2026-10-31", "2026-10-10", "2026-10-11")).toBe(true);
  });
});

describe("ketersediaan unit", () => {
  const bookings = [
    booking({ jumlahUnit: 2 }),
    booking({ jumlahUnit: 1, status: "Menunggu", tanggalMulai: "2026-10-12", tanggalSelesai: "2026-10-15" }),
    booking({ jumlahUnit: 3, status: "Dibatalkan" }),
    booking({ jumlahUnit: 3, status: "Selesai" }),
    booking({ jumlahUnit: 3, itemId: "item-lain" }),
  ];

  it("hanya booking aktif (Menunggu/Dikonfirmasi) alat yang sama yang menahan unit", () => {
    expect(getBookedUnitsInRange(bookings, "item-1", "2026-10-12", "2026-10-12")).toBe(3);
    expect(getBookedUnitsInRange(bookings, "item-1", "2026-10-14", "2026-10-14")).toBe(1);
  });

  it("unit tersedia = total - maintenance - terbooking, bisa negatif saat overbooked", () => {
    expect(getAvailableUnitsInRange(item, bookings, "2026-10-12", "2026-10-12")).toBe(0);
    expect(getAvailableUnitsInRange(item, bookings, "2026-10-20", "2026-10-21")).toBe(3);
    expect(getAvailableUnitsInRange(item, [...bookings, booking({ jumlahUnit: 1 })], "2026-10-12", "2026-10-12")).toBe(-1);
  });

  it("booking yang sedang diedit tidak menghitung dirinya sendiri", () => {
    const own = booking({ id: "edit-me", jumlahUnit: 2 });
    expect(getAvailableUnitsInRange(item, [own], "2026-10-10", "2026-10-12", "edit-me")).toBe(3);
  });
});
