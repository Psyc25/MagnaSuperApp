import { describe, expect, it } from "vitest";
import { lerpTowards, turnPopEnvelope, TURN_POP_MS } from "./Avatars";

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

describe("turnPopEnvelope (animasi squash/stretch + lean badan saat belok)", () => {
  it("nol kalau belum pernah ganti arah (elapsed Infinity)", () => {
    expect(turnPopEnvelope(Infinity)).toBe(0);
  });

  it("nol tepat di awal (elapsed 0) -- pop baru mulai 'masuk', belum ada efek", () => {
    expect(turnPopEnvelope(0)).toBe(0);
  });

  it("naik dari 0, memuncak di tengah durasi, balik ke dekat 0 di ujung", () => {
    const quarter = turnPopEnvelope(TURN_POP_MS * 0.25);
    const half = turnPopEnvelope(TURN_POP_MS * 0.5);
    const threeQuarter = turnPopEnvelope(TURN_POP_MS * 0.75);
    expect(half).toBeGreaterThan(quarter);
    expect(half).toBeCloseTo(1);
    expect(threeQuarter).toBeLessThan(half);
    expect(threeQuarter).toBeCloseTo(quarter);
  });

  it("nol begitu durasi (TURN_POP_MS) terlewati atau elapsed negatif", () => {
    expect(turnPopEnvelope(TURN_POP_MS)).toBe(0);
    expect(turnPopEnvelope(TURN_POP_MS + 50)).toBe(0);
    expect(turnPopEnvelope(-5)).toBe(0);
  });

  it("menghormati durationMs custom (bukan cuma TURN_POP_MS default)", () => {
    expect(turnPopEnvelope(50, 100)).toBeCloseTo(1);
    expect(turnPopEnvelope(100, 100)).toBe(0);
  });
});
