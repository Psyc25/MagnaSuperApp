import { describe, expect, it } from "vitest";
import { buildUserContext } from "./system-prompt";
import { getToolsForUser, isActionTool } from "./tools";

const toolsFor = (division: string) =>
  getToolsForUser(buildUserContext({ id: "u", full_name: "User", division })).map((t) => t.function.name).sort();

describe("akses tool Asisten AI per divisi", () => {
  it("akses penuh mendapat semua tool", () => {
    expect(toolsFor("all")).toEqual(
      [
        "check_availability", "create_booking", "create_event_expense", "get_bookings", "get_capital_requests", "get_clients",
        "get_daily_summary", "get_event_detail", "get_events", "get_expenses", "get_inventory", "get_invoices", "get_materials",
        "get_projects", "get_purchase_orders", "search_global", "update_booking_status",
      ].sort()
    );
  });

  it("investor tidak mendapat tool aksi apa pun", () => {
    expect(toolsFor("investor").filter(isActionTool)).toEqual([]);
  });

  it("staf Production tidak mendapat tool Magnarent", () => {
    const tools = toolsFor("production");
    expect(tools).not.toContain("create_booking");
    expect(tools).not.toContain("get_bookings");
    expect(tools).toContain("get_materials");
  });

  it("finance boleh catat pengeluaran & lihat event, tapi tidak booking", () => {
    const tools = toolsFor("finance");
    expect(tools).toContain("create_event_expense");
    expect(tools).toContain("get_events");
    expect(tools).not.toContain("create_booking");
  });

  it("divisi kosong diperlakukan sebagai production (fail-closed)", () => {
    expect(toolsFor("")).toEqual(toolsFor("production"));
  });

  it("faktur & pengajuan modal hanya untuk yang berhak", () => {
    expect(toolsFor("finance")).toContain("get_invoices");
    expect(toolsFor("finance")).not.toContain("get_capital_requests");
    expect(toolsFor("investor")).toEqual(expect.arrayContaining(["get_invoices", "get_capital_requests", "get_purchase_orders"]));
    expect(toolsFor("magnarent")).not.toContain("get_invoices");
    expect(toolsFor("magnative")).not.toContain("get_purchase_orders");
  });

  it("ringkasan harian tersedia untuk semua divisi", () => {
    for (const d of ["all", "magnarent", "magnative", "production", "finance", "investor"]) {
      expect(toolsFor(d)).toContain("get_daily_summary");
    }
  });
});
