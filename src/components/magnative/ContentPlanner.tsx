"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  MessageSquareWarning,
  Pencil,
  Plus,
  Rss,
  Search,
  Trash2,
} from "lucide-react";
import { useMagnativeData } from "./MagnativeDataProvider";
import { updateContentStatus } from "@/lib/magnative/actions";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateID, todayISO } from "@/lib/shared/utils";
import { cn } from "@/lib/cn";
import type { ContentPost, ContentStatus, Platform } from "@/lib/magnative/types";
import { CONTENT_STATUS_STYLES as STATUS_STYLES, PLATFORM_STYLES } from "@/lib/status-styles";
import { GLASS_BORDER, GLASS_INPUT, GLASS_SURFACE } from "@/lib/glass";

const GRADIENT = "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)";

const ALL_PLATFORMS: Platform[] = ["Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn", "Lainnya"];
/**
 * Alur approval (Tahap 28b): Draft → Revisi (kalau perlu diperbaiki) →
 * Disetujui → Tayang. Lihat `NEXT_APPROVAL_STATUS` di bawah untuk logika
 * tombol "lanjut" per status.
 */
const ALL_STATUSES: ContentStatus[] = ["Draft", "Revisi", "Disetujui", "Tayang"];
const ALL_FILTER = "Semua";

// Kalender Konten (Tahap 43 — permintaan Owner): sebelumnya jadwal 28 hari
// dibuat manual di file terpisah (lihat catatan riwayat kerja) — sekarang
// tinggal beralih tampilan Tabel/Kalender dari data yang SAMA (tidak ada
// tabel baru, tidak ada Server Action baru), supaya kalender selalu sinkron
// dengan status approval yang sudah ada.
const HARI_LABEL = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** Grid 6x7 bulan tertentu, dimulai hari Senin — sel di luar bulan bernilai null. */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  // getDay(): 0=Minggu..6=Sabtu -> digeser supaya 0=Senin..6=Minggu.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Status tujuan tombol "lanjut" (CheckCircle2) di tiap baris — null berarti sudah status akhir. */
const NEXT_APPROVAL_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  Draft: "Disetujui",
  Revisi: "Disetujui",
  Disetujui: "Tayang",
};
const NEXT_APPROVAL_LABEL: Partial<Record<ContentStatus, string>> = {
  Draft: "Setujui",
  Revisi: "Setujui",
  Disetujui: "Tandai Tayang",
};

function emptyForm() {
  return {
    clientId: "",
    title: "",
    platform: "Instagram" as Platform,
    tanggalPosting: todayISO(),
    status: "Draft" as ContentStatus,
    catatan: "",
    feedbackRevisi: "",
  };
}

function postToForm(p: ContentPost) {
  return {
    clientId: p.clientId ?? "",
    title: p.title,
    platform: p.platform,
    tanggalPosting: p.tanggalPosting,
    status: p.status,
    catatan: p.catatan ?? "",
    feedbackRevisi: p.feedbackRevisi ?? "",
  };
}

/**
 * Perencana konten sosial media — tabel jadwal posting + modal tambah/edit,
 * dan konfirmasi hapus. Konten bisa dikaitkan ke klien (opsional, untuk
 * konten yang dibuat atas nama klien) atau dibiarkan kosong untuk konten
 * internal Magna Technology sendiri.
 */
export function ContentPlanner() {
  const { clients, contentPosts, addContentPost, updateContentPost, deleteContentPost } = useMagnativeData();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentPost | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [platformFilter, setPlatformFilter] = useState<string>(ALL_FILTER);

  // Tombol "Minta Revisi" (Tahap 28b) — butuh catatan singkat sebelum
  // statusnya berubah, jadi dibuka lewat modal kecil ini alih-alih langsung
  // mengubah status seperti tombol "Setujui"/"Tandai Tayang".
  const [revisionTarget, setRevisionTarget] = useState<ContentPost | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const [view, setView] = useState<"tabel" | "kalender">("tabel");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const clientName = useCallback(
    (id?: string) => (id ? clients.find((c) => c.id === id)?.name ?? "—" : "Internal"),
    [clients]
  );

  const sortedPosts = useMemo(
    () => [...contentPosts].sort((a, b) => a.tanggalPosting.localeCompare(b.tanggalPosting)),
    [contentPosts]
  );

  const filteredPosts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedPosts.filter((p) => {
      const matchesSearch = !term || p.title.toLowerCase().includes(term) || clientName(p.clientId).toLowerCase().includes(term);
      const matchesStatus = statusFilter === ALL_FILTER || p.status === statusFilter;
      const matchesPlatform = platformFilter === ALL_FILTER || p.platform === platformFilter;
      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [sortedPosts, searchTerm, statusFilter, platformFilter, clientName]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, ContentPost[]>();
    for (const p of filteredPosts) {
      const list = map.get(p.tanggalPosting) ?? [];
      list.push(p);
      map.set(p.tanggalPosting, list);
    }
    return map;
  }, [filteredPosts]);

  const calendarGrid = useMemo(
    () => buildCalendarGrid(calendarCursor.year, calendarCursor.month),
    [calendarCursor]
  );
  const calendarTitle = new Date(calendarCursor.year, calendarCursor.month, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const todayISOValue = todayISO();

  function goToMonth(offset: number) {
    setCalendarCursor((prev) => {
      const d = new Date(prev.year, prev.month + offset, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToCurrentMonth() {
    const now = new Date();
    setCalendarCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  function openAddModal(prefillDate?: string) {
    setEditingId(null);
    setForm({ ...emptyForm(), ...(prefillDate ? { tanggalPosting: prefillDate } : {}) });
    setError(null);
    setFormOpen(true);
  }

  function openEditModal(p: ContentPost) {
    setEditingId(p.id);
    setForm(postToForm(p));
    setError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.title.trim()) {
      setError("Judul/topik konten wajib diisi.");
      return;
    }
    if (!form.tanggalPosting) {
      setError("Tanggal posting wajib diisi.");
      return;
    }

    if (form.status === "Revisi" && !form.feedbackRevisi.trim()) {
      setError('Catatan revisi wajib diisi kalau status "Revisi".');
      return;
    }

    const payload = {
      clientId: form.clientId || undefined,
      title: form.title.trim(),
      platform: form.platform,
      tanggalPosting: form.tanggalPosting,
      status: form.status,
      catatan: form.catatan.trim() || undefined,
      feedbackRevisi: form.status === "Revisi" ? form.feedbackRevisi.trim() : undefined,
    };

    setSubmitting(true);
    const result = editingId ? await updateContentPost(editingId, payload) : await addContentPost(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    showToast(editingId ? `Konten "${payload.title}" berhasil diperbarui.` : `Konten "${payload.title}" berhasil ditambahkan.`);
    closeFormModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteContentPost(deleteTarget.id);
    if (!result.ok) {
      showToast(result.error, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`Konten "${deleteTarget.title}" berhasil dihapus.`);
    setDeleteTarget(null);
  }

  /** Tombol "Setujui"/"Tandai Tayang" — lompat langsung ke status berikutnya tanpa buka modal. */
  async function handleAdvanceStatus(post: ContentPost) {
    const next = NEXT_APPROVAL_STATUS[post.status];
    if (!next) return;
    setStatusUpdatingId(post.id);
    const result = await updateContentStatus(post.id, next);
    setStatusUpdatingId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Konten "${post.title}" sekarang berstatus "${next}".`);
  }

  function openRevisionModal(post: ContentPost) {
    setRevisionTarget(post);
    setRevisionNote("");
  }

  async function handleSubmitRevision(e: FormEvent) {
    e.preventDefault();
    if (!revisionTarget) return;
    if (!revisionNote.trim()) return;

    setRevisionSubmitting(true);
    const result = await updateContentStatus(revisionTarget.id, "Revisi", revisionNote.trim());
    setRevisionSubmitting(false);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Konten "${revisionTarget.title}" dikembalikan untuk revisi.`);
    setRevisionTarget(null);
    setRevisionNote("");
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Perencana Konten</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredPosts.length} dari {contentPosts.length} konten ditampilkan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-black/10 p-0.5 dark:border-white/10">
            <button
              type="button"
              onClick={() => setView("tabel")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                view === "tabel"
                  ? "bg-fuchsia-600 text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Tabel
            </button>
            <button
              type="button"
              onClick={() => setView("kalender")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                view === "kalender"
                  ? "bg-fuchsia-600 text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Kalender
            </button>
          </div>
          <button
            type="button"
            onClick={() => openAddModal()}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: GRADIENT }}
          >
            <Plus className="h-4 w-4" />
            Tambah Konten
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari judul konten atau klien…"
            className={cn("w-full rounded-full border py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:text-white", GLASS_INPUT)}
          />
        </div>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-fuchsia-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option value={ALL_FILTER}>Semua Platform</option>
          {ALL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn("rounded-full border px-3.5 py-2 text-sm text-zinc-700 outline-none ring-fuchsia-500/40 focus:ring-2 dark:text-zinc-200 dark:[&>option]:bg-zinc-900", GLASS_INPUT)}
        >
          <option value={ALL_FILTER}>Semua Status</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {view === "kalender" ? (
        <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
          <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                aria-label="Bulan sebelumnya"
                className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToMonth(1)}
                aria-label="Bulan berikutnya"
                className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <h3 className="ml-1 text-sm font-bold capitalize text-zinc-900 dark:text-white">{calendarTitle}</h3>
            </div>
            <button
              type="button"
              onClick={goToCurrentMonth}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Hari Ini
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-black/5 dark:border-white/10">
            {HARI_LABEL.map((h) => (
              <div
                key={h}
                className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
              >
                {h}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarGrid.map((date, i) => {
              if (!date) {
                return <div key={`blank-${i}`} className="min-h-[100px] border-b border-r border-black/5 bg-zinc-50/50 dark:border-white/5 dark:bg-white/[0.02]" />;
              }
              const iso = toISODate(date);
              const dayPosts = postsByDate.get(iso) ?? [];
              const isToday = iso === todayISOValue;
              return (
                <div
                  key={iso}
                  className="group min-h-[100px] border-b border-r border-black/5 p-1.5 last:border-r-0 dark:border-white/5"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold",
                        isToday ? "bg-fuchsia-600 text-white" : "text-zinc-400 dark:text-zinc-500"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAddModal(iso)}
                      aria-label={`Tambah konten tanggal ${date.getDate()}`}
                      className="hidden h-5 w-5 place-items-center rounded-full text-zinc-300 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-600 group-hover:grid dark:text-zinc-600 dark:hover:bg-fuchsia-500/10 dark:hover:text-fuchsia-300"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dayPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openEditModal(p)}
                        title={`${p.title} — ${clientName(p.clientId)}`}
                        className={cn(
                          "block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold",
                          PLATFORM_STYLES[p.platform]
                        )}
                      >
                        {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <th className="px-5 py-3">Konten</th>
                <th className="px-5 py-3">Klien</th>
                <th className="px-5 py-3">Platform</th>
                <th className="px-5 py-3">Tanggal Posting</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Rss}
                      title={contentPosts.length === 0 ? "Belum ada konten terjadwal" : "Tidak ada hasil"}
                      description={
                        contentPosts.length === 0
                          ? "Klik \"Tambah Konten\" untuk mulai mengisi kalender konten."
                          : "Coba ubah kata kunci pencarian atau filter."
                      }
                    />
                  </td>
                </tr>
              )}
              {filteredPosts.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-white">
                    {p.title}
                    {p.status === "Revisi" && p.feedbackRevisi && (
                      <p className="mt-1 max-w-[220px] text-xs font-normal text-amber-600 dark:text-amber-300">
                        <MessageSquareWarning className="mr-1 inline h-3 w-3" />
                        {p.feedbackRevisi}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{clientName(p.clientId)}</td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PLATFORM_STYLES[p.platform])}>
                      {p.platform}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {formatDateID(p.tanggalPosting)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[p.status])}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {NEXT_APPROVAL_STATUS[p.status] && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceStatus(p)}
                          disabled={statusUpdatingId === p.id}
                          title={NEXT_APPROVAL_LABEL[p.status]}
                          aria-label={NEXT_APPROVAL_LABEL[p.status]}
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {p.status !== "Tayang" && (
                        <button
                          type="button"
                          onClick={() => openRevisionModal(p)}
                          title="Minta revisi"
                          aria-label="Minta revisi"
                          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                        >
                          <MessageSquareWarning className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        title="Edit konten"
                        aria-label="Edit konten"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-600 dark:hover:bg-fuchsia-500/10 dark:hover:text-fuchsia-300"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        title="Hapus konten"
                        aria-label="Hapus konten"
                        className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <Modal open={formOpen} onClose={closeFormModal} title={editingId ? "Edit Konten" : "Tambah Konten Baru"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="content-title" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Judul/Topik Konten
            </label>
            <input
              id="content-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="mis. Teaser Product Launch"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="content-client" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Klien (opsional — kosongkan untuk konten internal)
            </label>
            <select
              id="content-client"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">Internal (bukan atas nama klien)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="content-platform" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Platform
              </label>
              <select
                id="content-platform"
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
              >
                {ALL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="content-post-date" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Tanggal Posting
              </label>
              <input
                id="content-post-date"
                type="date"
                value={form.tanggalPosting}
                onChange={(e) => setForm((f) => ({ ...f, tanggalPosting: e.target.value }))}
                className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="content-status" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Status
            </label>
            <select
              id="content-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ContentStatus }))}
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-fuchsia-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {form.status === "Revisi" && (
            <div>
              <label htmlFor="content-feedback-revisi" className="mb-1.5 block text-xs font-semibold text-amber-600 dark:text-amber-300">
                Catatan Revisi — apa yang perlu diperbaiki?
              </label>
              <textarea
                id="content-feedback-revisi"
                value={form.feedbackRevisi}
                onChange={(e) => setForm((f) => ({ ...f, feedbackRevisi: e.target.value }))}
                rows={2}
                placeholder="mis. warna teks kurang kontras, ganti caption jadi lebih santai"
                className="w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-white"
              />
            </div>
          )}

          <div>
            <label htmlFor="content-catatan" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Catatan/Caption (opsional)
            </label>
            <input
              id="content-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              placeholder="mis. draft caption, brief visual"
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
              onClick={closeFormModal}
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
              {submitting ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Simpan Konten"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Konten"
        description={
          deleteTarget && (
            <>
              Yakin hapus konten <strong>{deleteTarget.title}</strong>? Tindakan ini tidak bisa dibatalkan.
            </>
          )
        }
      />

      <Modal
        open={revisionTarget !== null}
        onClose={() => setRevisionTarget(null)}
        title={`Minta Revisi — ${revisionTarget?.title ?? ""}`}
      >
        <form onSubmit={handleSubmitRevision} className="space-y-4">
          <div>
            <label htmlFor="revision-note" className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Apa yang perlu diperbaiki?
            </label>
            <textarea
              id="revision-note"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="mis. warna teks kurang kontras, ganti caption jadi lebih santai"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRevisionTarget(null)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={revisionSubmitting || !revisionNote.trim()}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {revisionSubmitting ? "Mengirim…" : "Kirim ke Revisi"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
