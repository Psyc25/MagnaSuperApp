import { describe, expect, it } from "vitest";
import { fetchAllPages, fetchInChunks, PAGE_SIZE } from "./paginate";

const rows = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: "1" + String(start + i).padStart(7, "0") }));

describe("fetchAllPages", () => {
  it("terus mengambil halaman sampai halaman terakhir tidak penuh", async () => {
    const all = rows(PAGE_SIZE * 2 + 5);
    const calls: string[] = [];
    const result = await fetchAllPages(async (afterId) => {
      calls.push(afterId);
      const rest = all.filter((r) => r.id > afterId);
      return { data: rest.slice(0, PAGE_SIZE), error: null };
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(PAGE_SIZE * 2 + 5);
    expect(calls).toHaveLength(3);
  });

  it("tepat 1000 baris berhenti setelah satu halaman kosong", async () => {
    const all = rows(PAGE_SIZE);
    const result = await fetchAllPages(async (afterId) => ({
      data: all.filter((r) => r.id > afterId).slice(0, PAGE_SIZE),
      error: null,
    }));
    expect(result.data).toHaveLength(PAGE_SIZE);
  });

  it("error di tengah mengembalikan data sejauh ini + errornya", async () => {
    let n = 0;
    const result = await fetchAllPages(async () =>
      n++ === 0 ? { data: rows(PAGE_SIZE), error: null } : { data: null, error: { message: "timeout" } }
    );
    expect(result.data).toHaveLength(PAGE_SIZE);
    expect(result.error?.message).toBe("timeout");
  });
});

describe("fetchInChunks", () => {
  it("memecah daftar id per 150 supaya URL .in() tidak terlalu panjang", async () => {
    const ids = rows(400).map((r) => r.id);
    const chunkSizes: number[] = [];
    const result = await fetchInChunks(ids, async (chunk, afterId) => {
      if (afterId === "00000000-0000-0000-0000-000000000000") chunkSizes.push(chunk.length);
      return { data: afterId === "00000000-0000-0000-0000-000000000000" ? chunk.map((id) => ({ id })) : [], error: null };
    });
    expect(chunkSizes).toEqual([150, 150, 100]);
    expect(result.data).toHaveLength(400);
  });
});
