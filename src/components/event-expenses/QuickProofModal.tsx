"use client";

import { useState } from "react";
import { Loader2, Trash2, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { prepareUploadFiles } from "@/lib/shared/image";
import { addExpenseProof, deleteExpenseProof } from "@/lib/event-expenses/actions";
import type { EventExpense, ExpenseProof } from "@/lib/event-expenses/types";
import { useResetOnChange } from "@/lib/shared/use-synced-state";

const GRADIENT = "linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)";

/**
 * Modal ringan khusus bukti transaksi (Opsi A, laporan gap Oktober 2026) —
 * dipakai dari badge/tombol cepat di `EventExpenseManager.tsx` supaya
 * tambah/lihat/hapus bukti tidak perlu buka `EventExpenseFormModal` penuh
 * (yang juga memuat semua field pengeluaran lain). Logic upload & hapus
 * di sini sengaja disalin-sederhanakan dari modal penuh itu, bukan dipakai
 * bersama lewat komponen induk, karena keduanya punya bentuk form yang
 * beda (field lengkap vs. cuma daftar+upload bukti).
 */
export function QuickProofModal({
  expense,
  onClose,
  onProofsChanged,
}: {
  /** null = modal tertutup. */
  expense: EventExpense | null;
  onClose: () => void;
  onProofsChanged: (expenseId: string, proofs: ExpenseProof[]) => void;
}) {
  const [proofs, setProofs] = useState<ExpenseProof[]>(expense?.proofs ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Isi ulang daftar bukti setiap kali baris pengeluaran yang dibuka
  // berganti (atau modal baru dibuka) -- pola sama seperti
  // EventExpenseFormModal, lihat use-synced-state.ts.
  useResetOnChange(expense?.id ?? null, (key) => {
    if (key === null) return;
    setProofs(expense?.proofs ?? []);
    setFiles([]);
    setError(null);
  });

  async function handleUpload() {
    if (!expense || files.length === 0) return;
    setUploading(true);
    setError(null);
    const failed: string[] = [];
    let current = proofs;

    for (let i = 0; i < files.length; i++) {
      const prepared = await prepareUploadFiles([files[i]]);
      if (!prepared.ok) {
        failed.push(files[i].name);
        continue;
      }
      const fd = new FormData();
      fd.set("expenseId", expense.id);
      fd.set("picName", expense.picName);
      fd.set("expenseDate", expense.expenseDate);
      fd.set("amount", String(expense.amount));
      fd.set("note", expense.notes || expense.category);
      fd.set("index", String(current.length + 1));
      fd.set("file", prepared.files[0]);

      const result = await addExpenseProof(fd).catch(() => null);
      if (result?.ok) {
        current = [...current, result.proof];
        setProofs(current);
        onProofsChanged(expense.id, current);
      } else {
        failed.push(files[i].name);
      }
    }

    setUploading(false);
    setFiles([]);
    setError(failed.length > 0 ? `${failed.length} file gagal diunggah: ${failed.join(", ")}.` : null);
  }

  async function handleDelete(proofId: string) {
    if (!expense) return;
    setDeletingId(proofId);
    const result = await deleteExpenseProof(proofId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const remaining = proofs.filter((p) => p.id !== proofId);
    setProofs(remaining);
    onProofsChanged(expense.id, remaining);
  }

  return (
    <Modal open={expense !== null} onClose={onClose} title="Bukti Transaksi" maxWidth="max-w-sm">
      {expense && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {expense.category} — {expense.picName}
          </p>

          {proofs.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-black/5 p-2 dark:border-white/10">
              {proofs.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300"
                >
                  <a
                    href={p.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
                    title={p.fileName}
                  >
                    {p.fileName}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDelete(p.id)}
                    disabled={deletingId === p.id}
                    title="Hapus bukti ini"
                    aria-label={`Hapus ${p.fileName}`}
                    className="shrink-0 text-zinc-400 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label
              htmlFor="qp-files"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/10 px-3.5 py-4 text-sm font-medium text-zinc-500 transition-colors hover:border-violet-400 hover:text-violet-600 dark:border-white/10 dark:text-zinc-400"
            >
              <Upload className="h-4 w-4" />
              {files.length > 0 ? `${files.length} file dipilih` : "Pilih foto nota/bon/bukti transfer"}
            </label>
            <input
              id="qp-files"
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Maks. 10MB per file — foto (JPG/PNG/HEIC) atau PDF.
            </p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-zinc-400 hover:text-rose-600"
                      aria-label={`Hapus ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Selesai
            </button>
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                style={{ background: GRADIENT }}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Mengunggah…" : "Unggah"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
