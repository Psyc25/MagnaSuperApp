import { describe, expect, it } from "vitest";
import { classifyReply } from "./reply-classifier";

describe("classifyReply", () => {
  it.each(["Ya", "ya lanjut", "Ya, lanjut!", "oke simpan aja", "iya boleh", "baik", "sip gas"])("'%s' = konfirmasi", (t) => {
    expect(classifyReply(t)).toBe("confirm");
  });
  it.each(["Batal", "tidak jadi", "gak usah", "ga jadi", "jangan dulu", "nggak usah deh"])("'%s' = batal", (t) => {
    expect(classifyReply(t)).toBe("cancel");
  });
  it.each([
    "ya tapi tanggalnya ganti",
    "ya tidak",
    "berapa totalnya?",
    "",
    "ya ya ya ya ya ya",
  ])("'%s' diteruskan ke AI (bukan ya/batal)", (t) => {
    expect(classifyReply(t)).toBeNull();
  });
});
