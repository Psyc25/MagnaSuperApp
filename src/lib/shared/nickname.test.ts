import { describe, expect, it } from "vitest";
import { isValidNickname, normalizeNickname, suggestNickname } from "./nickname";

describe("nickname", () => {
  it("menormalkan huruf besar dan spasi di ujung", () => {
    expect(normalizeNickname("  Budi ")).toBe("budi");
  });

  it("menolak spasi di tengah dan panjang di luar 3-20", () => {
    expect(isValidNickname("budi santoso")).toBe(false);
    expect(isValidNickname("bo")).toBe(false);
    expect(isValidNickname("a".repeat(21))).toBe(false);
    expect(isValidNickname("budi.s_2")).toBe(true);
  });

  it("mengusulkan dari kata pertama nama lengkap", () => {
    expect(suggestNickname("Budi Santoso", "x@y.com")).toBe("budi");
  });

  it("jatuh ke email kalau kata pertama terlalu pendek", () => {
    expect(suggestNickname("Al", "alfian.r@gmail.com")).toBe("alfian.r");
    expect(suggestNickname("", "jo@x.com")).toBe("jouser");
  });

  it("hasil usulan selalu valid", () => {
    for (const [n, e] of [["Ñoño Ölaf", "ñ@x.com"], ["A", "b@c.d"], ["Muhammad Abdurrahman Wahid", "m@x.com"]]) {
      expect(isValidNickname(suggestNickname(n, e))).toBe(true);
    }
  });
});
