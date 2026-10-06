import { describe, expect, it } from "vitest";
import { daysBetween } from "./report-tools";

describe("daysBetween", () => {
  it("menghitung hari kalender, termasuk lintas bulan", () => {
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
    expect(daysBetween("2026-09-28", "2026-10-03")).toBe(5);
    expect(daysBetween("2026-10-06", "2026-10-06")).toBe(0);
  });
});
