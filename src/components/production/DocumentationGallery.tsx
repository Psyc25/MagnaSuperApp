"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Camera, Plus, Trash2 } from "lucide-react";
import { useProductionData } from "./ProductionDataProvider";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";
import { addProjectPhoto, deleteProjectPhoto } from "@/lib/production/extras-actions";
import { DOCUMENTATION_TAHAP, type DocumentationTahap, type ProjectPhoto } from "@/lib/production/extras-types";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";

const GRADIENT = "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)";
const ALL_PROJECTS_FILTER = "Semua Proyek";
const ALL_TAHAP_FILTER = "Semua Tahap";

const TAHAP_BADGE: Record<DocumentationTahap, string> = {
  Sebelum: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
  Sesudah: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

/**
 * Galeri dokumentasi before/after (Tahap 28c) — pengganti `PlaceholderGallery`
 * statis yang sebelumnya nangkring di halaman Proyek Booth. Daftar proyek
 * untuk badge nama proyek & dropdown "Tambah Foto" diambil dari
 * `ProductionDataProvider` (sudah dimuat di layout), sama seperti pola
 * `ContentRequestManager` di Magnativ — halaman ini cuma fetch foto-fotonya.
 */
export function DocumentationGallery({ photos }: { photos: ProjectPhoto[] }) {
  const { projects } = useProductionData();
  const { showToast } = useToast();

  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS_FILTER);
  const [tahapFilter, setTahapFilter] = useState<string>(ALL_TAHAP_FILTER);

  const [addOpen, setAddOpen] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");
  const [addTahap, setAddTahap] = useState<DocumentationTahap>("Sebelum");
  const [addCaption, setAddCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<ProjectPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Proyek tidak dikenal";

  const filteredPhotos = useMemo(
    () =>
      photos.filter((photo) => {
        const matchesProject = projectFilter === ALL_PROJECTS_FILTER || photo.projectId === projectFilter;
        const matchesTahap = tahapFilter === ALL_TAHAP_FILTER || photo.tahap === tahapFilter;
        return matchesProject && matchesTahap;
      }),
    [photos, projectFilter, tahapFilter]
  );

  function openAddModal() {
    setAddProjectId(projects[0]?.id ?? "");
    setAddTahap("Sebelum");
    setAddCaption("");
    setPreviewUrl(null);
    setError(null);
    setAddOpen(true);
  }

  function closeAddModal() {
    setAddOpen(false);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!addProjectId) {
      setError("Pilih proyek booth terlebih dahulu.");
      return;
    }
    if (!file) {
      setError("Pilih foto terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    const prepared = await prepareUploadFiles([file]);
    if (!prepared.ok) {
      setSubmitting(false);
      setError(prepared.error);
      return;
    }
    const formData = new FormData();
    formData.set("projectId", addProjectId);
    formData.set("tahap", addTahap);
    formData.set("caption", addCaption.trim());
    formData.set("photo", prepared.files[0]);

    const result = await addProjectPhoto(formData);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`Foto "${addTahap}" berhasil ditambahkan.`);
    closeAddModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteProjectPhoto(deleteTarget.id);
    setDeleting(false);

    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast("Foto dokumentasi berhasil dihapus.");
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Dokumentasi Proyek</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredPhotos.length} dari {photos.length} foto ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          disabled={projects.length === 0}
          title={projects.length === 0 ? "Buat proyek booth terlebih dahulu di tab Proyek Booth" : undefined}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Tambah Foto
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-amber-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option>{ALL_PROJECTS_FILTER}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {[ALL_TAHAP_FILTER, ...DOCUMENTATION_TAHAP].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTahapFilter(t)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                tahapFilter === t
                  ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "border-black/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filteredPhotos.length === 0 ? (
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <EmptyState
            icon={Camera}
            title={photos.length === 0 ? "Belum ada dokumentasi" : "Tidak ada foto di filter ini"}
            description={
              photos.length === 0
                ? 'Klik "Tambah Foto" untuk mulai mengunggah dokumentasi sebelum/sesudah instalasi.'
                : "Coba pilih proyek atau tahap lain."
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPhotos.map((photo) => (
            <figure
              key={photo.id}
              className={cn("group overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={photo.photoUrl}
                  alt={`${photo.tahap} — ${projectName(photo.projectId)}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={() => setDeleteTarget(photo)}
                  title="Hapus foto"
                  aria-label="Hapus foto"
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-zinc-600 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-white hover:text-rose-600 group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <figcaption className="p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", TAHAP_BADGE[photo.tahap])}>
                    {photo.tahap}
                  </span>
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">{projectName(photo.projectId)}</p>
                {photo.caption && (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{photo.caption}</p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={closeAddModal} title="Tambah Foto Dokumentasi">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label htmlFor="doc-add-project" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Proyek Booth
            </label>
            <select
              id="doc-add-project"
              value={addProjectId}
              onChange={(e) => setAddProjectId(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Tahap</label>
            <div className="flex gap-1.5">
              {DOCUMENTATION_TAHAP.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAddTahap(t)}
                  className={cn(
                    "flex-1 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                    addTahap === t
                      ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "border-black/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="doc-add-photo" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Foto
            </label>
            <input
              id="doc-add-photo"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 file:mr-3 file:rounded-full file:border-0 file:bg-amber-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-amber-700 focus:ring-2 dark:border-white/10 dark:text-white dark:file:bg-amber-500/10 dark:file:text-amber-300"
            />
            {previewUrl && (
              <div className="relative mt-2.5 aspect-video w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal dari blob: URL */}
                <img src={previewUrl} alt="Pratinjau foto" className="h-full w-full object-cover" />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="doc-add-caption" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Keterangan (opsional)
            </label>
            <input
              id="doc-add-caption"
              value={addCaption}
              onChange={(e) => setAddCaption(e.target.value)}
              placeholder="mis. tampak depan booth, sudut kiri panggung"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeAddModal}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: GRADIENT }}
            >
              {submitting ? "Mengunggah…" : "Simpan Foto"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Foto Dokumentasi"
        description={
          deleteTarget && (
            <>
              Yakin hapus foto <strong>{deleteTarget.tahap}</strong> dari proyek{" "}
              <strong>{projectName(deleteTarget.projectId)}</strong>? Tindakan ini tidak bisa dibatalkan.
              {deleting && " Menghapus…"}
            </>
          )
        }
      />
    </div>
  );
}
