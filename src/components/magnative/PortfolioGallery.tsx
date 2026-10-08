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
  addPhotosToFolder,
  createPortfolioFolder,
  deletePortfolioFolder,
  deletePortfolioPhoto,
  updatePortfolioFolder,
} from "@/lib/magnative/actions";
import type { PortfolioFolder } from "@/lib/magnative/types";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";

/** Maksimal foto per sekali pilih/upload (Opsi A, laporan gap Oktober 2026) —
 * `mapWithConcurrency` di lib/shared/image.ts sudah membatasi beban CPU per
 * batch jadi 3 foto paralel, tapi tanpa batas jumlah total, pilih 30-50 foto
 * sekaligus tetap bisa makan waktu sangat lama & terasa seperti macet. Angka
 * ini yang ditampilkan ke user kalau kelebihan, bukan dipotong diam-diam --
 * supaya user tahu harus unggah bertahap. */
const MAX_PHOTOS_PER_UPLOAD = 10;

/**
 * Galeri portofolio Magnativ — model FOLDER/ALBUM (migrasi 0057, Update
 * Opsional 1 butir 5), menggantikan grid satu-foto-per-kartu yang lama.
 * Tiap folder bisa memuat banyak foto sekaligus, ditampilkan sebagai slide
 * lewat `PhotoCarousel` saat folder dibuka. Server Component induk
 * (`page.tsx`, atau widget Dashboard Hub) meneruskan daftar folder sebagai
 * props; `revalidatePath` di tiap action membuat daftar ini otomatis
 * ter-refresh setelah mutasi — makanya semua state "sedang dilihat/diedit/
 * dihapus" di bawah cuma menyimpan ID, lalu dicari ulang dari props
 * `folders` tiap render supaya selalu sinkron dengan data terbaru, bukan
 * snapshot basi dari sebelum mutasi.
 */
export function PortfolioGallery({ folders }: { folders: PortfolioFolder[] }) {
  const { showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCaption, setAddCaption] = useState("");
  const [addPreviews, setAddPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  // Progress kompresi saat upload banyak foto sekaligus -- tanpa ini, user
  // cuma lihat "Mengunggah..." diam selama puluhan detik saat pilih 15-30
  // foto kamera HP, yang terasa seperti macet/hang padahal masih proses
  // (lihat mapWithConcurrency di lib/shared/image.ts untuk fix beban CPU-nya).
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const [morePhotosProgress, setMorePhotosProgress] = useState<{ done: number; total: number } | null>(null);

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
    setAddProgress(null);
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  }

  function handleAddFilesChange() {
    const files = Array.from(addFileInputRef.current?.files ?? []);
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      setError(`Maksimal ${MAX_PHOTOS_PER_UPLOAD} foto per sekali unggah. Pilih ulang foto dengan jumlah lebih sedikit, lalu unggah sisanya lewat "Tambah Foto Lagi" setelah folder dibuat.`);
      setAddPreviews([]);
      if (addFileInputRef.current) addFileInputRef.current.value = "";
      return;
    }
    setError(null);
    setAddPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  async function handleAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(addFileInputRef.current?.files ?? []);
    if (files.length === 0) {
      setError("Pilih minimal satu foto terlebih dahulu.");
      return;
    }
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      // Jaring pengaman -- seharusnya sudah tertangkap di handleAddFilesChange,
      // tapi dicek ulang di sini kalau-kalau input berubah lewat jalur lain.
      setError(`Maksimal ${MAX_PHOTOS_PER_UPLOAD} foto per sekali unggah.`);
      return;
    }
    if (!addTitle.trim()) {
      setError("Judul folder wajib diisi.");
      return;
    }

    setSubmitting(true);
    setAddProgress({ done: 0, total: files.length });
    const prepared = await prepareUploadFiles(files, {
      onProgress: (done, total) => setAddProgress({ done, total }),
    });
    if (!prepared.ok) {
      setSubmitting(false);
      setAddProgress(null);
      setError(prepared.error);
      return;
    }
    const formData = new FormData();
    prepared.files.forEach((file) => formData.append("photos", file));
    formData.set("title", addTitle.trim());
    formData.set("caption", addCaption.trim());

    const result = await createPortfolioFolder(formData);
    setSubmitting(false);
    setAddProgress(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`Folder "${addTitle.trim()}" berhasil ditambahkan.`);
    closeAddModal();
  }

  async function handleAddMorePhotos() {
    if (!viewingFolder) return;
    const files = Array.from(morePhotosInputRef.current?.files ?? []);
    if (files.length === 0) return;
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      showToast(`Maksimal ${MAX_PHOTOS_PER_UPLOAD} foto per sekali unggah. Pilih ulang dengan jumlah lebih sedikit, lalu unggah sisanya secara bertahap.`, "error");
      if (morePhotosInputRef.current) morePhotosInputRef.current.value = "";
      return;
    }

    setAddingPhotos(true);
    setMorePhotosProgress({ done: 0, total: files.length });
    const prepared = await prepareUploadFiles(files, {
      onProgress: (done, total) => setMorePhotosProgress({ done, total }),
    });
    if (!prepared.ok) {
      setAddingPhotos(false);
      setMorePhotosProgress(null);
      if (morePhotosInputRef.current) morePhotosInputRef.current.value = "";
      showToast(prepared.error, "error");
      return;
    }
    const formData = new FormData();
    prepared.files.forEach((file) => formData.append("photos", file));

    const result = await addPhotosToFolder(viewingFolder.id, formData);
    setAddingPhotos(false);
    setMorePhotosProgress(null);
    if (morePhotosInputRef.current) morePhotosInputRef.current.value = "";

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`${files.length} foto berhasil ditambahkan.`);
  }

  async function confirmDeletePhoto() {
    if (!deletingPhotoId) return;
    const result = await deletePortfolioPhoto(deletingPhotoId);
    setDeletingPhotoId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast("Foto berhasil dihapus.");
  }

  function openEditModal(folder: PortfolioFolder) {
    setEditingFolderId(folder.id);
    setEditTitle(folder.title);
    setEditCaption(folder.caption ?? "");
    setEditError(null);
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingFolder) return;
    if (!editTitle.trim()) {
      setEditError("Judul folder wajib diisi.");
      return;
    }

    setEditSubmitting(true);
    const result = await updatePortfolioFolder(editingFolder.id, {
      title: editTitle.trim(),
      caption: editCaption.trim() || undefined,
    });
    setEditSubmitting(false);

    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    showToast("Keterangan folder berhasil diperbarui.");
    setEditingFolderId(null);
  }


  async function confirmDeleteFolder() {
    if (!deletingFolder) return;
    setDeletingFolderBusy(true);
    const result = await deletePortfolioFolder(deletingFolder.id);
    setDeletingFolderBusy(false);

    if (!result.ok) {
      showToast(result.error, "error");
      setDeletingFolderId(null);
      return;
    }
    showToast(`Folder "${deletingFolder.title}" berhasil dihapus.`);
    const wasViewing = viewingFolderId === deletingFolder.id;
    setDeletingFolderId(null);
    if (wasViewing) setViewingFolderId(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Portofolio</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Dokumentasi event, konten, dan showcase klien Magnativ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Tambah Folder
        </button>
      </div>

      {folders.length === 0 ? (
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <EmptyState
            icon={Camera}
            title="Belum ada folder portofolio"
            description='Klik "Tambah Folder" untuk mengunggah dokumentasi event atau konten pertama.'
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

      <Modal open={addOpen} onClose={closeAddModal} title="Tambah Folder Portofolio">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="portfolio-add-photos"
              className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              Foto (bisa pilih beberapa sekaligus)
            </label>
            <input
              id="portfolio-add-photos"
              ref={addFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAddFilesChange}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 file:mr-3 file:rounded-full file:border-0 file:bg-fuchsia-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fuchsia-700 focus:ring-2 dark:border-white/10 dark:text-white dark:file:bg-fuchsia-500/10 dark:file:text-fuchsia-300"
            />
            {addPreviews.length > 0 && (
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {addPreviews.map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-lg border border-black/10 dark:border-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal dari blob: URL, next/image tidak perlu untuk ini */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="portfolio-add-title"
              className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              Judul
            </label>
            <input
              id="portfolio-add-title"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="mis. Dokumentasi Gala Dinner Amal"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="portfolio-add-caption"
              className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              Keterangan (opsional)
            </label>
            <input
              id="portfolio-add-caption"
              value={addCaption}
              onChange={(e) => setAddCaption(e.target.value)}
              placeholder="mis. panggung utama, momen highlight acara"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
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
              {submitting
                ? addProgress && addProgress.done < addProgress.total
                  ? `Mengompres foto ${addProgress.done}/${addProgress.total}…`
                  : "Mengunggah…"
                : "Simpan Folder"}
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
              emptyLabel="Belum ada foto di folder ini."
            />
            {viewingFolder.caption && (
              <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{viewingFolder.caption}</p>
            )}

            {viewingFolder.photos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viewingFolder.photos.map((photo, i) => (
                  <div
                    key={photo.id}
                    className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10"
                  >
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
                id="portfolio-more-photos"
              />
              <label
                htmlFor="portfolio-more-photos"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-fuchsia-400/60 px-3.5 py-2 text-xs font-semibold text-fuchsia-600 transition-colors hover:bg-fuchsia-50 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
                {addingPhotos
                  ? morePhotosProgress && morePhotosProgress.done < morePhotosProgress.total
                    ? `Mengompres foto ${morePhotosProgress.done}/${morePhotosProgress.total}…`
                    : "Mengunggah…"
                  : "Tambah Foto Lagi"}
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-black/5 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setDeletingFolderId(viewingFolder.id)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Folder
              </button>
              <button
                type="button"
                onClick={() => openEditModal(viewingFolder)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editingFolder !== null} onClose={() => setEditingFolderId(null)} title="Edit Keterangan Folder">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="portfolio-edit-title"
              className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              Judul
            </label>
            <input
              id="portfolio-edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="portfolio-edit-caption"
              className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              Keterangan (opsional)
            </label>
            <input
              id="portfolio-edit-caption"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          {editError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {editError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingFolderId(null)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={editSubmitting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: GRADIENT }}
            >
              {editSubmitting ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingFolderId !== null}
        onClose={() => setDeletingFolderId(null)}
        onConfirm={confirmDeleteFolder}
        title="Hapus Folder"
        description={
          deletingFolder && (
            <>
              Yakin hapus folder <strong>{deletingFolder.title}</strong> beserta semua ({deletingFolder.photos.length})
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
        description="Yakin hapus foto ini dari folder? Tindakan ini tidak bisa dibatalkan."
      />
    </div>
  );
}
