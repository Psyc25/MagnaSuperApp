import { describe, expect, it } from "vitest";
import { lerpTowards } from "./Avatars";

describe("lerpTowards (halus posisi avatar rekan lain)", () => {
  it("bergerak sebagian ke arah target, tidak langsung loncat", () => {
    const next = lerpTowards({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(0);
  });

  it("loncat langsung (teleport) kalau jaraknya melebihi ambang -- pindah lantai lewat tangga", () => {
    const next = lerpTowards({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0.1, 300);
    expect(next).toEqual({ x: 1000, y: 0 });
  });

  it("tidak meleset sedikit pun kalau sudah persis di target", () => {
    const next = lerpTowards({ x: 50, y: 50 }, { x: 50, y: 50 }, 0.3);
    expect(next).toEqual({ x: 50, y: 50 });
  });
});
