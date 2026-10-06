import { describe, expect, it } from "vitest";
import { formatPhoneID } from "./whatsapp";

describe("formatPhoneID", () => {
  it("awalan 0 diganti 62, spasi/strip/kurung dibuang", () => {
    expect(formatPhoneID("0812-3456 7890")).toBe("6281234567890");
    expect(formatPhoneID("(0812) 3456-7890")).toBe("6281234567890");
  });
  it("+62 dan 62 dipertahankan", () => {
    expect(formatPhoneID("+62 812 3456 7890")).toBe("6281234567890");
    expect(formatPhoneID("6281234567890")).toBe("6281234567890");
  });
  it("tanpa awalan dianggap nomor lokal", () => {
    expect(formatPhoneID("81234567890")).toBe("6281234567890");
  });
  it("kosong atau terlalu pendek = null", () => {
    expect(formatPhoneID("")).toBeNull();
    expect(formatPhoneID(null)).toBeNull();
    expect(formatPhoneID("0812")).toBeNull();
  });
});
