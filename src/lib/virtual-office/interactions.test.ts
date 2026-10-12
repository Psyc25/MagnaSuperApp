import { describe, expect, it } from "vitest";
import { FURNITURE } from "./house";
import { findNearestInteractable, interactionStandPoint, INTERACT_RADIUS } from "./interactions";

describe("Interaksi perabot", () => {
  it("meja piknik Halaman Depan terdeteksi dari dekat, tidak dari jauh", () => {
    const table = FURNITURE.find((f) => f.id === "picnic-table")!;
    const center = interactionStandPoint(table);
    const near = findNearestInteractable(center, FURNITURE);
    expect(near?.furniture.id).toBe("picnic-table");
    expect(near?.config.kind).toBe("duduk");

    const far = findNearestInteractable({ x: center.x + 500, y: center.y + 500 }, FURNITURE);
    expect(far).toBeNull();
  });

  it("api unggun = pose 'hangat', bukan 'duduk'", () => {
    const bonfire = FURNITURE.find((f) => f.id === "bonfire")!;
    const near = findNearestInteractable(interactionStandPoint(bonfire), FURNITURE);
    expect(near?.furniture.id).toBe("bonfire");
    expect(near?.config.kind).toBe("hangat");
  });

  it("perabot dekorasi (rack/crate/car) tidak punya interaksi", () => {
    const crate = FURNITURE.find((f) => f.kind === "crate")!;
    const near = findNearestInteractable(interactionStandPoint(crate), FURNITURE);
    // Tidak boleh ke-match sebagai dirinya sendiri (crate tidak ada di
    // INTERACTION_BY_KIND) -- tapi bisa saja ke-match perabot lain yang
    // kebetulan dalam radius, makanya cek id-nya bukan crate itu sendiri.
    expect(near?.furniture.id).not.toBe(crate.id);
  });

  it("titik berdiri ikut sisi mana avatar mendekat, bukan selalu tepi bawah", () => {
    // Keluhan Owner (Okt 2026, round 2): avatar yang udah mepet di sisi
    // kiri/atas perabot malah "meluncur" muter ke tepi bawah pas tombol
    // interaksi diklik. Meja besar Ruang Creative dites dari 3 sisi.
    const table = FURNITURE.find((f) => f.id === "creative-table")!;
    const { x, y, w, h } = table.rect;

    const fromAbove = interactionStandPoint(table, { x: x + w / 2, y: y - 30 });
    expect(fromAbove.y).toBeLessThan(y); // nempel tepi ATAS, bukan bawah
    expect(fromAbove.x).toBeCloseTo(x + w / 2);

    const fromRight = interactionStandPoint(table, { x: x + w + 30, y: y + h / 2 });
    expect(fromRight.x).toBeGreaterThan(x + w); // nempel tepi KANAN

    const fromBelow = interactionStandPoint(table, { x: x + w / 2, y: y + h + 30 });
    expect(fromBelow.y).toBeGreaterThan(y + h); // nempel tepi BAWAH (sama kayak sebelumnya)
  });

  it("tanpa approachPos (mis. dipanggil tanpa konteks avatar) tetap fallback ke tepi bawah", () => {
    const table = FURNITURE.find((f) => f.id === "creative-table")!;
    const noPos = interactionStandPoint(table);
    expect(noPos.y).toBeGreaterThan(table.rect.y + table.rect.h);
  });

  it("radius interaksi konsisten dengan konstanta yang diekspor", () => {
    // Dites dari sisi BAWAH bench-1 (bukan atas) -- bench-2 cuma 48px di
    // atas bench-1, lebih sempit dari INTERACT_RADIUS, jadi titik uji di
    // atas bisa ke-match bench-2 duluan. Sisi bawah bench-1 bebas dari
    // perabot lain dalam radius ini.
    const bench = FURNITURE.find((f) => f.id === "bench-1")!;
    const belowEdge = bench.rect.y + bench.rect.h;
    const justInside = { x: bench.rect.x + bench.rect.w / 2, y: belowEdge + (INTERACT_RADIUS - 2) };
    const justOutside = { x: bench.rect.x + bench.rect.w / 2, y: belowEdge + (INTERACT_RADIUS + 20) };
    expect(findNearestInteractable(justInside, FURNITURE)?.furniture.id).toBe("bench-1");
    expect(findNearestInteractable(justOutside, FURNITURE)?.furniture.id).not.toBe("bench-1");
  });
});
