import { describe, expect, it } from "vitest";
import { HAIR_STYLES, SHIRT_COLORS, defaultLook, sanitizeLook } from "./avatar-look";

describe("avatar look", () => {
  it("tampilan bawaan tetap untuk id yang sama", () => {
    expect(defaultLook("abc")).toEqual(defaultLook("abc"));
  });

  it("nilai sah disimpan apa adanya", () => {
    const look = { skin: "#8d5a3b", hair: "#c2410c", hairStyle: "hijab", shirt: SHIRT_COLORS[3], pants: "#1e3a8a", accessory: "kacamata" };
    expect(sanitizeLook(look, "u1")).toEqual(look);
  });

  it("nilai di luar palet diganti nilai bawaan", () => {
    const base = defaultLook("u1");
    const out = sanitizeLook({ skin: "red", hairStyle: "<script>", shirt: 5, extra: "x" }, "u1");
    expect(out.skin).toBe(base.skin);
    expect(out.hairStyle).toBe(base.hairStyle);
    expect(out.shirt).toBe(base.shirt);
    expect(Object.keys(out).sort()).toEqual(["accessory", "hair", "hairStyle", "pants", "shirt", "skin"]);
    expect(HAIR_STYLES).toContain(out.hairStyle);
  });

  it("input bukan objek -> tampilan bawaan", () => {
    expect(sanitizeLook(null, "u2")).toEqual(defaultLook("u2"));
    expect(sanitizeLook("x", "u2")).toEqual(defaultLook("u2"));
  });
});
