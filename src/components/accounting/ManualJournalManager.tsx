"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookText, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { createManualJournalEntry, deleteManualJournalEntry } from "@/lib/accounting/actions";
import { DIVISION_LABELS, type Account, type JournalEntry, type ManualJournalDivision } from "@/lib/accounting/types";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { useSyncedState } from "@/lib/shared/use-synced-state";

type Side = "Debit" | "Kredit";
type LineRow = { accountCode: string; side: Side; amount: string; notes: string };

const DIVISION_OPTIONS: (ManualJournalDivision | "")[] = ["", "magnarent", "magnative", "production", "finance"];

function emptyRow(defaultCode: string, side: Side): LineRow {
  return { accountCode: defaultCode, side, amount: "", notes: "" };
}

function emptyForm() {
  return {
    entryDate: todayISO(),
    description: "",
    division: "" as ManualJournalDivision | "",
  };
}

/**
 * Jurnal Manual -- bagian kedua halaman Akuntansi (Tahap F), untuk
 * transaksi yang TIDAK lewat modul lain (setoran modal awal, koreksi
 * saldo, penyusutan aset, dst). Auto-posting dari Faktur/Realisasi Event
 * (Tahap B) sengaja tidak muncul di sini -- siklus hidupnya ikut sumbernya
 * masing-masing, cuma jurnal `source_type = 'manual'` yang bisa dibuat &
 * dihapus langsung dari halaman ini (lihat `deleteManualJournalEntry`).
 */
export function ManualJournalManager({
  initialEntries,
  accounts,
}: {
  initialEntries: JournalEntry[];
  accounts: Account[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [entries, setEntries] = useSyncedState(initialEntries);

  const activeAccounts = useMemo(
    () => [...accounts].filter((a) => a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState<LineRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openAddModal() {
    setForm(emptyForm());
    const firstCode = activeAccounts[0]?.code ?? "";
    setRows([emptyRow(firstCode, "Debit"), emptyRow(firstCode, "Kredit")]);
    setError(null);
    setFormOpen(true);
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(activeAccounts[0]?.code ?? "", "Debit")]);
  }

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const totalDebit = useMemo(
    () => rows.filter((r) => r.side === "Debit").reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows]
  );
  const totalCredit = useMemo(
    () => rows.filter((r) => r.side === "Kredit").reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows]
  );
  const isBalanced = rows.length >= 2 && totalDebit > 0 && totalDebit === totalCredit;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.description.trim()) {
      setError("Keterangan jurnal wajib diisi.");
      return;
    }
    if (rows.length < 2) {
      setError("Jurnal minimal punya 2 baris (debit dan kredit).");
      return;
    }
    for (const row of rows) {
      if (!row.accountCode) {
        setError("Setiap baris wajib memilih akun.");
        return;
      }
      if (!Number(row.amount) || Number(row.amount) <= 0) {
        setError("Setiap baris wajib diisi jumlah lebih dari 0.");
        return;
      }
    }
    if (totalDebit !== totalCredit) {
      setError(
        `Jurnal tidak balance: total debit ${formatRupiah(totalDebit)} vs kredit ${formatRupiah(totalCredit)}.`
      );
      return;
    }

    setSubmitting(true);
    const result = await createManualJournalEntry({
      entryDate: form.entryDate,
      description: form.description,
      division: form.division || null,
      lines: rows.map((r) => ({
        accountCode: r.accountCode,
        debit: r.side === "Debit" ? Math.round(Number(r.amount)) : 0,
        credit: r.side === "Kredit" ? Math.round(Number(r.amount)) : 0,
        notes: r.notes || undefined,
      })),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast("Jurnal manual berhasil dicatat.");
    setFormOpen(false);
    // Sama seperti createAccount -- entri barunya butuh nama/kode akun per
    // baris yang sudah diresolusi di server (getManualJournalEntries),
    // jadi lebih sederhana & tidak rawan salah daripada menyusun ulang
    // tampilannya sendiri di client.
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteManualJournalEntry(deleteTarget.id);
    setDeleting(false);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast("Jurnal berhasil dihapus.");
  }

  return (
    <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Jurnal Manual</h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Untuk transaksi di luar Faktur/Realisasi Event -- mis. setoran modal, koreksi saldo, penyusutan.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Catat Jurnal
        </button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={BookText}
          title="Belum ada jurnal manual"
          description="Catat transaksi pertama yang tidak lewat Faktur/Realisasi Event lewat tombol di atas."
        />
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => {
            const total = entry.lines.reduce((sum, l) => sum + l.debit, 0);
            return (
              <div key={entry.id} className="rounded-xl border border-zinc-100 p-3.5 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{entry.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDateID(entry.entryDate)}
                      {entry.division !== undefined && entry.division !== "" && (
                        <> · {DIVISION_LABELS[entry.division ?? ""] ?? entry.division}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{formatRupiah(total)}</p>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(entry)}
                      className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      aria-label="Hapus jurnal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <tbody>
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="border-t border-zinc-50 dark:border-zinc-800/60">
                          <td className="py-1.5 pr-2 text-zinc-500 dark:text-zinc-400">
                            {line.accountCode} — {line.accountName}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-zinc-700 dark:text-zinc-300">
                            {line.debit > 0 ? formatRupiah(line.debit) : ""}
                          </td>
                          <td className="py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                            {line.credit > 0 ? formatRupiah(line.credit) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Catat Jurnal Manual" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tanggal</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Divisi <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <select
                value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value as ManualJournalDivision | "" }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {DIVISION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === "" ? "Tanpa Divisi" : DIVISION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Keterangan</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="mis. Setoran modal awal kas kecil"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Baris Jurnal</label>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Baris
              </button>
            </div>

            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
                  <select
                    value={row.accountCode}
                    onChange={(e) => updateRow(i, { accountCode: e.target.value })}
                    className="min-w-[180px] flex-1 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Pilih akun…</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs dark:border-zinc-700">
                    {(["Debit", "Kredit"] as Side[]).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => updateRow(i, { side })}
                        className={cn(
                          "px-2.5 py-1.5 font-semibold transition-colors",
                          row.side === side
                            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                            : "bg-transparent text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/5"
                        )}
                      >
                        {side}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={row.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                    placeholder="Jumlah"
                    className="w-28 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 2}
                    className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div
              className={cn(
                "mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold",
                isBalanced
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              )}
            >
              <span className="flex items-center gap-1.5">
                {isBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                Debit {formatRupiah(totalDebit)} — Kredit {formatRupiah(totalCredit)}
              </span>
              <span>{isBalanced ? "Balance" : "Belum balance"}</span>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !isBalanced}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Jurnal
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Jurnal?"
        description={
          deleteTarget && (
            <>
              Jurnal <strong>&ldquo;{deleteTarget.description}&rdquo;</strong> tanggal{" "}
              {formatDateID(deleteTarget.entryDate)} akan dihapus permanen dan akan memengaruhi Laba-Rugi/Neraca/Arus
              Kas yang menghitung dari jurnal ini.
            </>
          )
        }
        confirmLabel={deleting ? "Menghapus…" : "Hapus"}
      />
    </section>
  );
}
