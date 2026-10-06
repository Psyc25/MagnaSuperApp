import { describe, expect, it } from "vitest";
import { buildUserContext } from "./system-prompt";
import { getToolsForUser, isActionTool } from "./tools";

const toolsFor = (division: string) =>
  getToolsForUser(buildUserContext({ id: "u", full_name: "User", division })).map((t) => t.function.name).sort();

describe("akses tool Asisten AI per divisi", () => {
  it("akses penuh mendapat semua tool", () => {
    expect(toolsFor("all")).toEqual(
      [
        "check_availability", "create_booking", "create_event_expense", "get_bookings", "get_clients", "get_events",
        "get_inventory", "get_materials", "get_projects", "search_global", "update_booking_status",
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
});
