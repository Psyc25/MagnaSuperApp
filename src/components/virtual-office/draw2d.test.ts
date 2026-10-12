import { describe, expect, it } from "vitest";
import { darken, lighten } from "./draw2d";

describe("Util warna chunky 2D (HouseScene/Avatars)", () => {
  it("lighten(warna, 0) = warna asli, lighten(warna, 1) = putih", () => {
    expect(lighten("#334155", 0)).toBe("#334155");
    expect(lighten("#334155", 1)).toBe("#ffffff");
  });

  it("darken(warna, 0) = warna asli, darken(warna, 1) = hitam", () => {
    expect(darken("#f97316", 0)).toBe("#f97316");
    expect(darken("#f97316", 1)).toBe("#000000");
  });

  it("warna tidak valid jatuh ke fallback, tidak melempar error", () => {
    expect(() => lighten("bukan-warna", 0.5)).not.toThrow();
    expect(() => darken("bukan-warna", 0.5)).not.toThrow();
  });
});
