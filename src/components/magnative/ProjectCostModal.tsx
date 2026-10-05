"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, Wallet2, X } from "lucide-react";
import { useMagnativeData } from "./MagnativeDataProvider";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDateID, formatRupiah, todayISO } from "@/lib/shared/utils";
import type { Project } from "@/lib/magnative/types";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_SUGGESTIONS } from "@/lib/event-expenses/types";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";

function emptyCostForm() {
  return { description: "", amount: "0", costDate: todayISO(), category: EXPENSE_CATEGORIES[0] as string, paymentMethod: "" };
}

/**
 * Modal rekap biaya per proyek (migrasi 0017) — jawaban langsung untuk
 * permintaan investor (diteruskan owner): "ada link yg bisa kasih kita
 * rekapan cost dan kapannya (keluar atau masuk dana)". Sisi dana MASUK
 * sudah tercatat lewat invoice yang terhubung ke proyek ini (tab Faktur);
 * modal ini melengkapi sisi dana KELUAR, dan sengaja bisa dibuka di
 * proyek tahap apa pun — termasuk "Pitching" yang belum tentu deal, karena
 * biaya pitching yang gagal pun tetap pengeluaran nyata.
 *
 * Field Kategori & Metode Pembayaran ditambahkan pasca-review (baris ini
 * sekarang tersimpan di `event_expenses` sejak Tahap C — lihat komentar di
 * src/lib/magnative/actions.ts) supaya rekap di halaman Realisasi Event
 * tetap rinci untuk biaya proyek Magnative, bukan selalu "Lain-lain".
 * Mode Edit (perbaikan pasca-review lain) dipicu dengan mengklik ikon
 * pensil di daftar — form yang sama dipakai ulang, tombol submit berubah
 * jadi "Simpan Perubahan" dan memanggil `updateProjectCost`.
 */
export function ProjectCostModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { getCostsForProject, addProjectCost, updateProjectCost, deleteProjectCost } = useMagnativeData();
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyCostForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const costs = getCostsForProject(project.id);
  const totalBiaya = useMemo(() => costs.reduce((sum, c) => sum + c.amount, 0), [costs]);

  function startEdit(id: string) {
    const target = costs.find((c) => c.id === id);
    if (!target) return;
    setEditingId(id);
    setForm({
      description: target.description,
      amount: String(target.amount),
      costDate: target.costDate,
      category: target.category || EXPENSE_CATEGORIES[0],
      paymentMethod: target.paymentMethod || "",
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyCostForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const amount = Number(form.amount);
    if (!form.description.trim()) {
      setError("Deskripsi biaya wajib diisi.");
      return;
    }
    if (!form.costDate) {
      setError("Tanggal wajib diisi.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Nominal harus lebih dari 0.");
      return;
    }
    if (!form.paymentMethod.trim()) {
      setError("Metode pembayaran wajib diisi.");
      return;
    }

    setSubmitting(true);
    const payload = {
      projectId: project.id,
      description: form.description.trim(),
      amount,
      costDate: form.costDate,
      category: form.category,
      paymentMethod: form.paymentMethod.trim(),
    };
    const result = editingId ? await updateProjectCost(editingId, payload) : await addProjectCost(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(emptyCostForm());
    setEditingId(null);
    setError(null);
    showToast(editingId ? "Biaya berhasil diperbarui." : "Biaya berhasil dicatat.");
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteProjectCost(id);
    setDeletingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    if (editingId === id) cancelEdit();
    showToast("Biaya berhasil dihapus.");
  }

  return (
    <Modal open onClose={onClose} title={`Biaya Proyek — ${project.name}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Total Biaya Tercatat</span>
          <span className="text-base font-bold text-zinc-900 dark:text-white">{formatRupiah(totalBiaya)}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="project-cost-description" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Deskripsi
            </label>
            <input
              id="project-cost-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="mis. Biaya pitching deck & presentasi"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project-cost-amount" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Nominal (Rp)
              </label>
              <input
                id="project-cost-amount"
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="project-cost-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal
              </label>
              <input
                id="project-cost-date"
                type="date"
                value={form.costDate}
                onChange={(e) => setForm((f) => ({ ...f, costDate: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project-cost-category" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Kategori
              </label>
              <select
                id="project-cost-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-cost-method" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Metode Pembayaran
              </label>
              <input
                id="project-cost-method"
                list="project-cost-method-suggestions"
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                placeholder="mis. Transfer BCA"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
              <datalist id="project-cost-method-suggestions">
                {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: GRADIENT }}
            >
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Catat Biaya"}
            </button>
          </div>
        </form>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10">
          {costs.length === 0 ? (
            <EmptyState
              icon={Wallet2}
              title="Belum ada biaya tercatat"
              description="Catat pengeluaran pertama lewat form di atas."
            />
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {costs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{c.description}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateID(c.costDate)} · {c.category}
                      {c.paymentMethod ? ` · ${c.paymentMethod}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-1 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRupiah(c.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => (editingId === c.id ? cancelEdit() : startEdit(c.id))}
                      title={editingId === c.id ? "Batal edit" : "Edit biaya"}
                      aria-label={editingId === c.id ? "Batal edit" : "Edit biaya"}
                      className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                    >
                      {editingId === c.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(c.id)}
                      disabled={deletingId === c.id}
                      title="Hapus biaya"
                      aria-label="Hapus biaya"
                      className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={async () => {
          if (deleteTargetId) await handleDelete(deleteTargetId);
          setDeleteTargetId(null);
        }}
        title="Hapus Biaya"
        description={(() => {
          const target = costs.find((c) => c.id === deleteTargetId);
          return target
            ? `Hapus biaya "${target.category}" sebesar ${formatRupiah(target.amount)}? Jurnal akuntansi dan bukti transaksi yang sudah diunggah (dari Realisasi Event) ikut terhapus. Tindakan ini tidak bisa dibatalkan.`
            : undefined;
        })()}
      />
    </Modal>
  );
}
