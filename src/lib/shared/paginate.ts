/*
 * Helper pagination bersama (dulu hanya di accounting/data.ts).
 */

/**
 * Supabase (PostgREST) memotong hasil query DIAM-DIAM di 1000 baris
 * (`max_rows`), dan daftar `.in(...)` dikirim lewat URL yang punya batas
 * panjang. Laporan akuntansi dulu mengambil semua ID jurnal sekaligus lalu
 * `.in("journal_entry_id", semuaId)` -- aman saat jurnal masih sedikit,
 * tapi begitu ratusan/ribuan jurnal otomatis terposting, angkanya akan
 * salah tanpa error. Dua helper ini mengambil per halaman & per potongan ID.
 */
export const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 150;
/** Titik awal keyset pagination -- semua UUID lebih besar dari UUID nol. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };
type AllRowsResult<T> = { data: T[]; error: { message: string } | null };

/**
 * Keyset pagination (`id > id terakhir`, urut id) -- bukan offset/range:
 * dengan offset, jurnal yang ditulis bersamaan saat laporan sedang diambil
 * bisa menggeser halaman sehingga ada baris terlewat atau terhitung dua kali.
 * Setiap query WAJIB menyertakan kolom `id`.
 */
export async function fetchAllPages<T extends { id: string }>(
  page: (afterId: string) => PromiseLike<PageResult<T>>
): Promise<AllRowsResult<T>> {
  const rows: T[] = [];
  let afterId = NIL_UUID;
  for (;;) {
    const { data, error } = await page(afterId);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
    afterId = data[data.length - 1].id;
  }
}

export async function fetchInChunks<T extends { id: string }>(
  ids: string[],
  page: (chunk: string[], afterId: string) => PromiseLike<PageResult<T>>
): Promise<AllRowsResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const result = await fetchAllPages<T>((afterId) => page(chunk, afterId));
    if (result.error) return { data: rows, error: result.error };
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}

