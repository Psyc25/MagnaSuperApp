"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { File as FileIcon, FolderOpen, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { addCreativeAsset, deleteCreativeAsset } from "@/lib/magnative/actions";
import { AssetCommentModal } from "./AssetCommentModal";
import { cn } from "@/lib/cn";
import type { CreativeAsset, CreativeAssetCategory } from "@/lib/magnative/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";
const ALL_CATEGORIES: CreativeAssetCategory[] = ["Template", "Foto Mentah", "Video", "Desain Grafis", "Lainnya"];
const ALL_FILTER = "Semua";

const CATEGORY_STYLES: Record<CreativeAssetCategory, string> = {
  Template: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  "Foto Mentah": "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  Video: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  "Desain Grafis": "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  Lainnya: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
};

/**
 * Galeri aset kreatif (Tahap 28b) — perpustakaan kerja internal tim
 * (template, foto mentah, video, file desain), BEDA dari `PortfolioGallery`
 * (showcase hasil jadi untuk klien/investor). Pola upload sama persis
 * dengan PortfolioGallery, bedanya file boleh gambar ATAU video — file
 * jenis lain (mis. .psd/.ai/.pdf template) ditampilkan dengan ikon generik
 * karena browser tidak bisa mempratinjaunya langsung.
 */
export function CreativeAssetGallery({ assets }: { assets: CreativeAsset[] }) {
  const { showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CreativeAssetCategory>("Lainnya");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_FILTER);
  const [deleteTarget, setDeleteTarget] = useState<CreativeAsset | null>(null);
  const [commentTarget, setCommentTarget] = useState<CreativeAsset | null>(null);

  const filteredAssets = useMemo(
    () => (categoryFilter === ALL_FILTER ? assets : assets.filter((a) => a.category === categoryFilter)),
    [assets, categoryFilter]
  );

  function closeAddModal() {
    setAddOpen(false);
    setPreviewUrl(null);
    setPreviewIsVideo(false);
    setTitle("");
    setCategory("Lainnya");
    setCaption("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setPreviewIsVideo(!!file && file.type.startsWith("video/"));
  }

  async function handleAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih file terlebih dahulu.");
      return;
    }
    if (!title.trim()) {
      setError("Judul aset wajib diisi.");
      return;
    }

    // Aset desain tidak dikompres (kualitas karya harus utuh), cuma dicek ukurannya.
    const prepared = await prepareUploadFiles([file], { compress: false });
    if (!prepared.ok) {
      setError(prepared.error);
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("title", title.trim());
    formData.set("category", category);
    formData.set("caption", caption.trim());

    setSubmitting(true);
    const result = await addCreativeAsset(formData);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    showToast(`Aset "${title.trim()}" berhasil ditambahkan.`);
    closeAddModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteCreativeAsset(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Aset "${deleteTarget.title}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Aset Kreatif</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Perpustakaan kerja tim — template, foto mentah, video, file desain.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GRADIENT }}
        >
          <Plus className="h-4 w-4" />
          Tambah Aset
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryFilter(ALL_FILTER)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            categoryFilter === ALL_FILTER
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20"
          )}
        >
          Semua
        </button>
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryFilter(c)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              categoryFilter === c
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : cn(CATEGORY_STYLES[c], "hover:opacity-80")
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {filteredAssets.length === 0 ? (
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <EmptyState
            icon={FolderOpen}
            title={assets.length === 0 ? "Belum ada aset kreatif" : "Tidak ada aset di kategori ini"}
            description={
              assets.length === 0
                ? 'Klik "Tambah Aset" untuk mengunggah template, foto mentah, atau file desain pertama.'
                : "Coba pilih kategori lain."
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAssets.map((asset) => (
            <figure
              key={asset.id}
              className={cn("group overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}
            >
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-zinc-100 dark:bg-white/5">
                {asset.fileType === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL publik dari Supabase Storage, domain dinamis per project
                  <img src={asset.fileUrl} alt={asset.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : asset.fileType === "video" ? (
                  <video src={asset.fileUrl} className="h-full w-full object-cover" muted controls />
                ) : (
                  <FileIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
                )}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setCommentTarget(asset)}
                    title="Komentar aset"
                    aria-label="Komentar aset"
                    className="rounded-full bg-white/90 p-1.5 text-zinc-600 shadow-sm backdrop-blur hover:bg-white hover:text-violet-600 dark:bg-zinc-900/90 dark:text-zinc-300"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    title="Hapus aset"
                    aria-label="Hapus aset"
                    className="rounded-full bg-white/90 p-1.5 text-zinc-600 shadow-sm backdrop-blur hover:bg-white hover:text-rose-600 dark:bg-zinc-900/90 dark:text-zinc-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <figcaption className="p-3">
                <span className={cn("mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", CATEGORY_STYLES[asset.category])}>
                  {asset.category}
                </span>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">{asset.title}</p>
                {asset.caption && (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{asset.caption}</p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={closeAddModal} title="Tambah Aset Kreatif">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label htmlFor="asset-file" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              File (gambar, video, atau file lain)
            </label>
            <input
              id="asset-file"
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 file:mr-3 file:rounded-full file:border-0 file:bg-fuchsia-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fuchsia-700 focus:ring-2 dark:border-white/10 dark:text-white dark:file:bg-fuchsia-500/10 dark:file:text-fuchsia-300"
            />
            {previewUrl &&
              (previewIsVideo ? (
                <video src={previewUrl} className="mt-2.5 aspect-video w-full rounded-xl border border-black/10 object-cover dark:border-white/10" controls muted />
              ) : (
                <div className="relative mt-2.5 aspect-video w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal dari blob: URL */}
                  <img src={previewUrl} alt="Pratinjau aset" className="h-full w-full object-cover" />
                </div>
              ))}
          </div>

          <div>
            <label htmlFor="asset-title" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Judul
            </label>
            <input
              id="asset-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Template Feed Instagram - Promo"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="asset-category" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Kategori
            </label>
            <select
              id="asset-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CreativeAssetCategory)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="asset-caption" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Keterangan (opsional)
            </label>
            <input
              id="asset-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="mis. dipakai untuk kampanye Q4"
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
              {submitting ? "Mengunggah…" : "Simpan Aset"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Aset"
        description={
          deleteTarget && (
            <>
              Yakin hapus aset <strong>{deleteTarget.title}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />

      {commentTarget && <AssetCommentModal asset={commentTarget} onClose={() => setCommentTarget(null)} />}
    </div>
  );
}
