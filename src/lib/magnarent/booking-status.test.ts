import { describe, expect, it } from "vitest";
import { canTransitionBooking } from "./booking-status";

describe("transisi status booking", () => {
  it("alur normal: Menunggu -> Dikonfirmasi -> Selesai", () => {
    expect(canTransitionBooking("Menunggu", "Dikonfirmasi")).toBe(true);
    expect(canTransitionBooking("Dikonfirmasi", "Selesai")).toBe(true);
  });
  it("pembatalan dari Menunggu maupun Dikonfirmasi", () => {
    expect(canTransitionBooking("Menunggu", "Dibatalkan")).toBe(true);
    expect(canTransitionBooking("Dikonfirmasi", "Dibatalkan")).toBe(true);
  });
  it("Selesai/Dibatalkan final (mencegah overbooking tanpa cek kapasitas)", () => {
    expect(canTransitionBooking("Dibatalkan", "Dikonfirmasi")).toBe(false);
    expect(canTransitionBooking("Selesai", "Menunggu")).toBe(false);
  });
  it("tidak bisa melompat Menunggu -> Selesai", () => {
    expect(canTransitionBooking("Menunggu", "Selesai")).toBe(false);
  });
});
