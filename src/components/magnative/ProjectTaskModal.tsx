"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMagnativeData } from "./MagnativeDataProvider";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateID, formatRupiah } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { Project, ProjectTaskStatus } from "@/lib/magnative/types";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";


const STATUS_STYLE: Record<ProjectTaskStatus, string> = {
  "Belum Mulai": "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
  Berjalan: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  Selesai: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

/** Status berikutnya kalau tombol centang dipencet -- siklus Belum Mulai -> Berjalan -> Selesai, mentok di Selesai (ubah manual lewat edit kalau perlu mundur). */
const NEXT_STATUS: Record<ProjectTaskStatus, ProjectTaskStatus | null> = {
  "Belum Mulai": "Berjalan",
  Berjalan: "Selesai",
  Selesai: null,
};

function emptyForm() {
  return { title: "", detail: "", dueDate: "", pic: "", vendorId: "", biayaEstimasi: "" };
}

/**
 * Modal task/timeline per proyek (Update Opsional 2 — hasil gap analysis
 * vs aplikasi event/creative agency luar yang selalu punya breakdown
 * task, bukan cuma funnel status proyek). Pola UI sama persis dengan
 * `ProjectCostModal` (form tambah di atas, daftar + aksi di bawah), field
 * PIC dipakai ulang dari `picOptions` yang sama dengan Papan Tracking.
 */
export function ProjectTaskModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const {
    getTasksForProject,
    picOptions,
    vendors,
    addProjectTask,
    updateProjectTask,
    updateProjectTaskStatus,
    deleteProjectTask,
  } = useMagnativeData();
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tasks = useMemo(
    () => getTasksForProject(project.id).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [getTasksForProject, project.id]
  );
  const doneCount = tasks.filter((t) => t.status === "Selesai").length;

  function startEdit(id: string) {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    setEditingId(id);
    setForm({
      title: target.title,
      detail: target.detail ?? "",
      dueDate: target.dueDate ?? "",
      pic: target.pic ?? "",
      vendorId: target.vendorId ?? "",
      biayaEstimasi: target.biayaEstimasi ? String(target.biayaEstimasi) : "",
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Judul task wajib diisi.");
      return;
    }

    setSubmitting(true);
    const existing = editingId ? tasks.find((t) => t.id === editingId) : undefined;
    const payload = {
      projectId: project.id,
      title: form.title.trim(),
      detail: form.detail.trim() || undefined,
      status: existing?.status ?? ("Belum Mulai" as ProjectTaskStatus),
      dueDate: form.dueDate || undefined,
      pic: form.pic || undefined,
      sortOrder: existing?.sortOrder ?? tasks.length,
      vendorId: form.vendorId || undefined,
      biayaEstimasi: form.biayaEstimasi ? Number(form.biayaEstimasi) : undefined,
    };
    const result = editingId ? await updateProjectTask(editingId, payload) : await addProjectTask(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    showToast(editingId ? "Task berhasil diperbarui." : "Task berhasil ditambahkan.");
  }

  async function handleAdvanceStatus(id: string, current: ProjectTaskStatus) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    setBusyId(id);
    const result = await updateProjectTaskStatus(id, next);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Status diubah ke "${next}".`);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteProjectTask(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    if (editingId === id) cancelEdit();
    showToast("Task berhasil dihapus.");
  }

  return (
    <Modal open onClose={onClose} title={`Task Proyek — ${project.name}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Progres Task</span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            {doneCount} / {tasks.length} selesai
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="task-title" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Judul Task
            </label>
            <input
              id="task-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="mis. Survei venue & booking tanggal"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="task-detail" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Detail (opsional)
            </label>
            <textarea
              id="task-detail"
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-due" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Deadline (opsional)
              </label>
              <input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="task-pic" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                PIC (opsional)
              </label>
              <select
                id="task-pic"
                value={form.pic}
                onChange={(e) => setForm((f) => ({ ...f, pic: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              >
                <option value="">— Belum ditunjuk —</option>
                {picOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-vendor" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Vendor/Sourcing (opsional)
              </label>
              <select
                id="task-vendor"
                value={form.vendorId}
                onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                <option value="">— Tidak dikaitkan —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-harga" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Estimasi Harga (Rp, opsional)
              </label>
              <input
                id="task-harga"
                type="number"
                min={0}
                step={1000}
                value={form.biayaEstimasi}
                onChange={(e) => setForm((f) => ({ ...f, biayaEstimasi: e.target.value }))}
                placeholder="mis. 40000"
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
              />
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Tambah Task"}
            </button>
          </div>
        </form>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10">
          {tasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="Belum ada task" description="Tambah task pertama lewat form di atas." />
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{t.title}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {t.picName ?? "Belum ditunjuk"}
                      {t.dueDate ? ` · Deadline ${formatDateID(t.dueDate)}` : ""}
                    </p>
                    {(t.vendorId || t.biayaEstimasi) && (
                      <p className="truncate text-[11px] text-violet-500 dark:text-violet-300">
                        {t.vendorId ? (vendors.find((v) => v.id === t.vendorId)?.name ?? "(vendor dihapus)") : "Sourcing internal"}
                        {t.biayaEstimasi ? ` · ${formatRupiah(t.biayaEstimasi)}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(t.id, t.status)}
                      disabled={busyId === t.id || t.status === "Selesai"}
                      title={t.status === "Selesai" ? "Sudah selesai" : `Lanjut ke "${NEXT_STATUS[t.status]}"`}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-default",
                        STATUS_STYLE[t.status]
                      )}
                    >
                      {t.status}
                    </button>
                    <button
                      type="button"
                      onClick={() => (editingId === t.id ? cancelEdit() : startEdit(t.id))}
                      title={editingId === t.id ? "Batal edit" : "Edit task"}
                      aria-label={editingId === t.id ? "Batal edit" : "Edit task"}
                      className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                    >
                      {editingId === t.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={busyId === t.id}
                      title="Hapus task"
                      aria-label="Hapus task"
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
    </Modal>
  );
}
