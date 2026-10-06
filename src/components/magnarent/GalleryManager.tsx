"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Camera, Images, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { PhotoCarousel } from "@/components/ui/PhotoCarousel";
import {
  addPhotosToGalleryFolder,
  createGalleryFolder,
  deleteGalleryFolder,
  deleteGalleryPhoto,
  updateGalleryFolder,
} from "@/lib/magnarent/extras-actions";
import type { GalleryFolder } from "@/lib/magnarent/extras-types";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";

const GRADIENT = "linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)";

/**
 * Galeri Kategori Alat — model FOLDER/ALBUM, satu folder = satu kategori
 * alat (mis. "Tenda & Struktur"), meniru `PortfolioGallery` di
 * `src/components/magnative/PortfolioGallery.tsx` (migrasi 0057).
 * Menggantikan `PlaceholderGallery` statis yang tadinya nangkring di
 * halaman Inventaris — staf sekarang bisa unggah foto asli per kategori
 * plus keterangan, bukan gambar dummy on-brand.
 */
export function GalleryManager({ folders }: { folders: GalleryFolder[] }) {
  const { showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCaption, setAddCaption] = useState("");
  const [addPreviews, setAddPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const [viewingFolderId, setViewingFolderId] = useState<string | null>(null);
  const viewingFolder = folders.find((f) => f.id === viewingFolderId) ?? null;
  const [addingPhotos, setAddingPhotos] = useState(false);
  const morePhotosInputRef = useRef<HTMLInputElement>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const editingFolder = folders.find((f) => f.id === editingFolderId) ?? null;
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const deletingFolder = folders.find((f) => f.id === deletingFolderId) ?? null;
  const [deletingFolderBusy, setDeletingFolderBusy] = useState(false);

  function closeAddModal() {
    setAddOpen(false);
    setAddTitle("");
    setAddCaption("");
    setAddPreviews([]);
    setError(null);
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  }

  function handleAddFilesChange() {
    const files = Array.from(addFileInputRef.current?.files ?? []);
    setAddPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  async function handleAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(addFileInputRef.current?.files ?? []);
    if (files.length === 0) {
      setError("Pilih minimal satu foto terlebih dahulu.");
      return;
    }
    if (!addTitle.trim()) {
      setError("Nama kategori wajib diisi.");
      return;
    }

    setSubmitting(true);
    const prepared = await prepareUploadFiles(files);
    if (!prepared.ok) {
      setSubmitting(false);
      setError(prepared.error);
      return;
    }
    const formData = new FormData();
    prepared.files.forEach((file) => formData.append("photos", file));
    formData.set("title", addTitle.trim());
    formData.set("caption", addCaption.trim());

    const result = await createGalleryFolder(formData);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`Kategori "${addTitle.trim()}" berhasil ditambahkan.`);
    closeAddModal();
  }

  async function handleAddMorePhotos() {
    if (!viewingFolder) return;
    const files = Array.from(morePhotosInputRef.current?.files ?? []);
    if (files.length === 0) return;

    setAddingPhotos(true);
    const prepared = await prepareUploadFiles(files);
    if (!prepared.ok) {
      setAddingPhotos(false);
      if (morePhotosInputRef.current) morePhotosInputRef.current.value = "";
      showToast(prepared.error, "error");
      return;
    }
    const formData = new FormData();
    prepared.files.forEach((file) => formData.append("photos", file));

    const result = await addPhotosToGalleryFolder(viewingFolder.id, formData);
    setAddingPhotos(false);
    if (morePhotosInputRef.current) morePhotosInputRef.current.value = "";

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`${files.length} foto berhasil ditambahkan.`);
  }

  async function confirmDeletePhoto() {
    if (!deletingPhotoId) return;
    const result = await deleteGalleryPhoto(deletingPhotoId);
    setDeletingPhotoId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Foto berhasil dihapus.");
  }

  function openEditModal(folder: GalleryFolder) {
    setEditingFolderId(folder.id);
    setEditTitle(folder.title);
    setEditCaption(folder.caption ?? "");
    setEditError(null);
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingFolder) return;
    if (!editTitle.trim()) {
      setEditError("Nama kategori wajib diisi.");
      return;
    }

    setEditSubmitting(true);
    const result = await updateGalleryFolder(editingFolder.id, {
      title: editTitle.trim(),
      caption: editCaption.trim() || undefined,
    });
    setEditSubmitting(false);

    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    showToast("Keterangan kategori berhasil diperbarui.");
    setEditingFolderId(null);
  }

  async function confirmDeleteFolder() {
    if (!deletingFolder) return;
    setDeletingFolderBusy(true);
    const result = await deleteGalleryFolder(deletingFolder.id);
    setDeletingFolderBusy(false);

    if (!result.ok) {
      showToast(result.error, "error");
      setDeletingFolderId(null);
      return;
    }
    showToast(`Kategori "${deletingFolder.title}" berhasil dihapus.`);
    const wasViewing = viewingFolderId === deletingFolder.id;
    setDeletingFolderId(null);
    if (wasViewing) setViewingFolderId(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Galeri Kategori Alat</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Dokumentasi foto asli per kategori alat rental — showcase untuk klien & referensi tim gudang.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Tambah Kategori
        </button>
      </div>

      {folders.length === 0 ? (
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <EmptyState
            icon={Camera}
            title="Belum ada foto kategori"
            description='Klik "Tambah Kategori" untuk mengunggah foto alat pertama, mis. Tenda & Struktur.'
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setViewingFolderId(folder.id)}
              className={cn("group overflow-hidden rounded-2xl border text-left shadow-sm transition-transform hover:-translate-y-0.5", GLASS_SURFACE, GLASS_BORDER)}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-white/5">
                {folder.photos[0] ? (
                  <Image
                    src={folder.photos[0].photoUrl}
                    alt={folder.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    unoptimized
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-zinc-300 dark:text-zinc-600">
                    <Camera className="h-8 w-8" />
                  </span>
                )}
                {folder.photos.length > 1 && (
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                    <Images className="h-3 w-3" />
                    {folder.photos.length}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">{folder.title}</p>
                {folder.caption && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {folder.caption}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={closeAddModal} title="Tambah Kategori Alat">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label htmlFor="gallery-add-photos" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Foto (bisa pilih beberapa sekaligus)
            </label>
            <input
              id="gallery-add-photos"
              ref={addFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAddFilesChange}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-cyan-500/40 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-700 focus:ring-2 dark:border-white/10 dark:text-white dark:file:bg-cyan-500/10 dark:file:text-cyan-300"
            />
            {addPreviews.length > 0 && (
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {addPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal dari blob: URL, next/image tidak perlu untuk ini */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="gallery-add-title" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Kategori
            </label>
            <input
              id="gallery-add-title"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="mis. Tenda & Struktur"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-cyan-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="gallery-add-caption" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Keterangan (opsional)
            </label>
            <input
              id="gallery-add-caption"
              value={addCaption}
              onChange={(e) => setAddCaption(e.target.value)}
              placeholder="mis. tenda roder & sarnavil, tersedia berbagai ukuran"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-cyan-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeAddModal} className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">
              Batal
            </button>
            <button type="submit" disabled={submitting} className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60" style={{ background: GRADIENT }}>
              {submitting ? "Mengunggah…" : "Simpan Kategori"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={viewingFolder !== null} onClose={() => setViewingFolderId(null)} title={viewingFolder?.title ?? ""}>
        {viewingFolder && (
          <div className="space-y-4">
            <PhotoCarousel
              photos={viewingFolder.photos.map((p) => ({ id: p.id, url: p.photoUrl }))}
              aspect="video"
              emptyLabel="Belum ada foto di kategori ini."
            />
            {viewingFolder.caption && (
              <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{viewingFolder.caption}</p>
            )}

            {viewingFolder.photos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viewingFolder.photos.map((photo, i) => (
                  <div key={photo.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                    <Image src={photo.photoUrl} alt="" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => setDeletingPhotoId(photo.id)}
                      title={`Hapus foto ${i + 1}`}
                      aria-label={`Hapus foto ${i + 1}`}
                      className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <input
                ref={morePhotosInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddMorePhotos}
                className="hidden"
                id="gallery-more-photos"
              />
              <label htmlFor="gallery-more-photos" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-cyan-400/60 px-3.5 py-2 text-xs font-semibold text-cyan-600 transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
                <Plus className="h-3.5 w-3.5" />
                {addingPhotos ? "Mengunggah…" : "Tambah Foto Lagi"}
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-black/5 pt-3 dark:border-white/10">
              <button type="button" onClick={() => setDeletingFolderId(viewingFolder.id)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Kategori
              </button>
              <button type="button" onClick={() => openEditModal(viewingFolder)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editingFolder !== null} onClose={() => setEditingFolderId(null)} title="Edit Keterangan Kategori">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label htmlFor="gallery-edit-title" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Nama Kategori
            </label>
            <input
              id="gallery-edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-cyan-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="gallery-edit-caption" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Keterangan (opsional)
            </label>
            <input
              id="gallery-edit-caption"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-cyan-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {editError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditingFolderId(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">
              Batal
            </button>
            <button type="submit" disabled={editSubmitting} className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60" style={{ background: GRADIENT }}>
              {editSubmitting ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingFolderId !== null}
        onClose={() => setDeletingFolderId(null)}
        onConfirm={confirmDeleteFolder}
        title="Hapus Kategori"
        description={
          deletingFolder && (
            <>
              Yakin hapus kategori <strong>{deletingFolder.title}</strong> beserta semua ({deletingFolder.photos.length})
              fotonya? Tindakan ini tidak bisa dibatalkan.
              {deletingFolderBusy && " Menghapus…"}
            </>
          )
        }
      />

      <ConfirmDialog
        open={deletingPhotoId !== null}
        onClose={() => setDeletingPhotoId(null)}
        onConfirm={confirmDeletePhoto}
        title="Hapus Foto"
        description="Yakin hapus foto ini dari kategori? Tindakan ini tidak bisa dibatalkan."
      />
    </div>
  );
}
