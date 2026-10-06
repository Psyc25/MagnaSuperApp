import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "./safe-redirect";

describe("safeRedirectTarget", () => {
  it("meneruskan path dashboard internal beserta query", () => {
    expect(safeRedirectTarget("/dashboard/magnarent/booking?tab=2")).toBe("/dashboard/magnarent/booking?tab=2");
    expect(safeRedirectTarget("/dashboard")).toBe("/dashboard");
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "/%5Cevil.com",
    "https://evil.com",
    "/\tevil.com",
    "javascript:alert(1)",
    "/login",
    "/dashboardx",
    "",
  ])("menolak '%s'", (v) => {
    expect(safeRedirectTarget(v)).toBe("/dashboard");
  });
  it("bukan string -> fallback", () => {
    expect(safeRedirectTarget(null)).toBe("/dashboard");
  });
});
