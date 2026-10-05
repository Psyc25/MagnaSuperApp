import { describe, expect, it } from "vitest";
import { computeDueReminders, reminderBody } from "./reminders";
import type { Invoice } from "./types";

const inv = (over: Partial<Invoice>): Invoice =>
  ({ id: "i", invoiceNumber: "INV/001", clientName: "PT Klien", total: 1_500_000, status: "Terkirim", items: [], ...over }) as Invoice;

const TODAY = "2026-10-05";

describe("computeDueReminders", () => {
  it("H-3, H-1 dan H-0 masing-masing tepat sekali", () => {
    const kinds = (due: string) => computeDueReminders([inv({ dueDate: due })], TODAY).map((r) => r.kind);
    expect(kinds("2026-10-08")).toEqual(["h3"]);
    expect(kinds("2026-10-07")).toEqual([]);
    expect(kinds("2026-10-06")).toEqual(["h1"]);
    expect(kinds("2026-10-05")).toEqual(["h0"]);
  });

  it("terlambat diingatkan tiap kelipatan 3 hari, bukan tiap hari", () => {
    const kinds = (due: string) => computeDueReminders([inv({ dueDate: due })], TODAY).map((r) => r.kind);
    expect(kinds("2026-10-04")).toEqual([]);
    expect(kinds("2026-10-02")).toEqual(["overdue"]);
    expect(kinds("2026-09-29")).toEqual(["overdue"]);
  });

  it("invoice Lunas atau tanpa jatuh tempo dilewati", () => {
    expect(computeDueReminders([inv({ dueDate: "2026-10-05", status: "Lunas" }), inv({ dueDate: undefined })], TODAY)).toEqual([]);
  });

  it("selisih hari benar saat melewati pergantian bulan", () => {
    expect(computeDueReminders([inv({ dueDate: "2026-11-01" })], "2026-10-29").map((r) => r.kind)).toEqual(["h3"]);
  });

  it("isi pesan terlambat menyebut jumlah hari", () => {
    const [r] = computeDueReminders([inv({ dueDate: "2026-10-02" })], TODAY);
    expect(reminderBody(r)).toContain("terlambat 3 hari");
  });
});
