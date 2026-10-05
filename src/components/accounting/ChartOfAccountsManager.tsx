"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { createAccount, deleteAccount, setAccountActive } from "@/lib/accounting/actions";
import type { Account, AccountType, NormalBalance } from "@/lib/accounting/types";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { useSyncedState } from "@/lib/shared/use-synced-state";

const ACCOUNT_TYPES: AccountType[] = ["Aset", "Kewajiban", "Modal", "Pendapatan", "Beban"];
const NORMAL_BALANCES: NormalBalance[] = ["Debit", "Kredit"];

function emptyForm() {
  return {
    code: "",
    name: "",
    type: "Aset" as AccountType,
    subtype: "",
    normalBalance: "Debit" as NormalBalance,
    description: "",
  };
}

/**
 * Daftar Akun (Chart of Accounts) -- bagian pertama halaman Akuntansi
 * (Tahap F). 23 akun bawaan dari seed migrasi 0051 sudah cukup untuk
 * kategori yang sudah dipakai modul lain (Realisasi Event/Faktur) -- form
 * "Tambah Akun" di sini untuk situasi akun baru dibutuhkan (rekening bank
 * baru, kategori beban baru, dst) tanpa perlu migrasi database tiap kali.
 *
 * Tombol hapus permanen HANYA aktif untuk akun yang belum pernah dipakai
 * satu baris jurnal pun -- lihat komentar `deleteAccount` di actions.ts.
 * Akun yang sudah pernah dipakai baris jurnal historis cuma bisa
 * dinonaktifkan (disembunyikan dari pilihan akun BARU), tidak bisa
 * dihapus permanen, supaya laporan lama tidak rusak.
 */
export function ChartOfAccountsManager({ initialAccounts }: { initialAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useSyncedState(initialAccounts);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  const grouped = useMemo(() => {
    const visible = accounts.filter((a) => showInactive || a.isActive);
    const map = new Map<AccountType, Account[]>();
    for (const a of visible) {
      const bucket = map.get(a.type) ?? [];
      bucket.push(a);
      map.set(a.type, bucket);
    }
    return ACCOUNT_TYPES.filter((t) => map.has(t)).map((t) => ({ type: t, list: map.get(t)! }));
  }, [accounts, showInactive]);

  function openAddModal() {
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setError("Kode dan nama akun wajib diisi.");
      return;
    }

    setSubmitting(true);
    const result = await createAccount({
      code: form.code,
      name: form.name,
      type: form.type,
      subtype: form.subtype,
      normalBalance: form.normalBalance,
      description: form.description,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast("Akun baru berhasil ditambahkan.");
    setFormOpen(false);
    // createAccount tidak mengembalikan row barunya (cuma { ok: true }) --
    // daripada menebak `id` di client, lebih aman refresh dari Server
    // Component supaya daftar akun (termasuk pengurutan by kode) selalu
    // sinkron persis dengan database.
    router.refresh();
  }

  async function handleToggleActive(account: Account) {
    setTogglingId(account.id);
    const result = await setAccountActive(account.id, !account.isActive);
    setTogglingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, isActive: !a.isActive } : a)));
    showToast(account.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan kembali.");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteAccount(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    showToast("Akun dihapus.");
    setDeleteTarget(null);
  }

  return (
    <section className={cn("rounded-2xl border p-5", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Daftar Akun</h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Chart of Accounts -- dipakai semua laporan (Laba-Rugi, Neraca, Arus Kas) dan posting otomatis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300"
            />
            Tampilkan nonaktif
          </label>
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Akun
          </button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon={Landmark} title="Belum ada akun" description="Tambah akun pertama lewat tombol di atas." />
      ) : (
        <div className="mt-4 space-y-5">
          {grouped.map(({ type, list }) => (
            <div key={type}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {type}
              </p>
              <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <th className="px-3 py-2 font-medium">Kode</th>
                      <th className="px-3 py-2 font-medium">Nama Akun</th>
                      <th className="px-3 py-2 font-medium">Subtipe</th>
                      <th className="px-3 py-2 font-medium">Saldo Normal</th>
                      <th className="px-3 py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr
                        key={a.id}
                        className={cn(
                          "border-t border-zinc-100 dark:border-zinc-800",
                          !a.isActive && "opacity-50"
                        )}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">{a.code}</td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{a.name}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{a.subtype || "—"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{a.normalBalance}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(a)}
                              disabled={togglingId === a.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                                a.isActive
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400"
                              )}
                            >
                              {togglingId === a.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : a.isActive ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Ban className="h-3 w-3" />
                              )}
                              {a.isActive ? "Aktif" : "Nonaktif"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(a)}
                              title="Hapus permanen (hanya kalau belum pernah dipakai jurnal)"
                              className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Tambah Akun">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Kode Akun</label>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="mis. 1-1003"
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tipe Akun</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Nama Akun</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Bank BCA Operasional 2"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Subtipe <span className="font-normal text-zinc-400">(opsional)</span>
              </label>
              <input
                value={form.subtype}
                onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}
                placeholder="mis. Aset Lancar"
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Saldo Normal
              </label>
              <select
                value={form.normalBalance}
                onChange={(e) => setForm((f) => ({ ...f, normalBalance: e.target.value as NormalBalance }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {NORMAL_BALANCES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Deskripsi <span className="font-normal text-zinc-400">(opsional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
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
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Akun
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Akun"
        description={`Hapus permanen akun "${deleteTarget?.code} — ${deleteTarget?.name}"? Hanya bisa dilakukan kalau akun ini belum pernah dipakai di baris jurnal manapun -- kalau sudah pernah, nonaktifkan saja.`}
        confirmLabel={deleting ? "Menghapus…" : "Hapus"}
      />
    </section>
  );
}
