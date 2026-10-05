"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteChatMessage,
  clearChatRoom,
  editChatMessage,
  getChatMessages,
  searchTaggableUsers,
  sendChatMessage,
  type ChatMessage,
  type TaggableUser,
} from "@/lib/chat/actions";
import { CHAT_ROOM_LABELS, EDIT_DELETE_WINDOW_MS, type ChatRoom } from "@/lib/chat/rooms";
import { DIVISION_BADGE_CLASSES, DIVISION_LABELS, type Division } from "@/lib/supabase/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_INPUT, GLASS_PILL, GLASS_SURFACE, GLASS_SURFACE_STRONG } from "@/lib/glass";
import { prepareUploadFiles } from "@/lib/shared/image";
import { formatBytes, formatTimeID, getAvatarColor, getInitials } from "@/lib/shared/utils";

const POLL_MS = 4000;
const MENTION_DEBOUNCE_MS = 200;
// Sama persis dengan ALLOWED_ATTACHMENT_TYPES/MAX_ATTACHMENT_BYTES di
// src/lib/chat/actions.ts — validasi di sini murni UX (gagal cepat sebelum
// upload), validasi yang SEBENARNYA tetap di server (klien bisa dimanipulasi).
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type CurrentUser = { id: string; username: string | null; fullName: string; division: Division };

type MentionState = { query: string; start: number };

/** Cari "@query" tepat di depan kursor pengetikan — dipakai untuk memicu
 * dropdown autocomplete @tag sambil mengetik. Wajib didahului awal teks
 * atau spasi (supaya alamat email dsb tidak ikut kepancing sebagai tag). */
function findMentionAtCursor(text: string, cursorPos: number): MentionState | null {
  const upToCursor = text.slice(0, cursorPos);
  const match = upToCursor.match(/(?:^|\s)@([a-z0-9._-]{0,20})$/i);
  if (!match) return null;
  const query = match[1];
  const start = upToCursor.length - query.length - 1;
  return { query, start };
}

/** Pecah body pesan jadi teks biasa + span highlight untuk tiap "@username" —
 * murni tampilan (highlight semua yang berpola @tag, tidak dicek ulang ke
 * daftar mentioned_user_ids — cukup untuk kebutuhan visual). */
function renderMessageBody(body: string) {
  const parts = body.split(/(@[a-z0-9._-]{3,20})/gi);
  return parts.map((part, i) =>
    /^@[a-z0-9._-]{3,20}$/i.test(part) ? (
      <span key={i} className="font-semibold text-indigo-600 dark:text-indigo-400">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Waktu aktivitas TERBARU sebuah pesan — dipakai untuk kursor polling (lihat
 * komentar panjang di getChatMessages, src/lib/chat/actions.ts): edit/hapus
 * pesan LAMA tidak mengubah `createdAt`-nya, jadi kursor harus ikut memandang
 * `editedAt`/`deletedAt` juga, bukan cuma `createdAt` pesan terakhir. */
function latestActivityIso(msg: ChatMessage): string {
  let latest = msg.createdAt;
  if (msg.editedAt && msg.editedAt > latest) latest = msg.editedAt;
  if (msg.deletedAt && msg.deletedAt > latest) latest = msg.deletedAt;
  return latest;
}

/** Gabungkan hasil poll (`incoming`) ke daftar pesan yang sudah ada —
 * UPSERT per-id (bukan sekadar ditempel di akhir seperti sebelum ada
 * edit/hapus), supaya pesan LAMA yang baru diedit/dihapus orang lain
 * ter-update di tempatnya, bukan malah dobel muncul di akhir daftar. */
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const msg of incoming) byId.set(msg.id, msg);
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Lampiran gambar ditampilkan sebagai thumbnail yang bisa diklik untuk
 * dibuka penuh di tab baru; lampiran dokumen lain ditampilkan sebagai chip
 * unduh dengan ikon + nama file + ukurannya (via `formatBytes`). */
function AttachmentPreview({ attachment, isOwn }: { attachment: ChatMessage["attachment"]; isOwn: boolean }) {
  if (!attachment) return null;

  if (attachment.type.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto dari Supabase Storage, bukan aset lokal Next.js */}
        <img src={attachment.url} alt={attachment.name} className="max-h-64 w-auto max-w-full object-cover" />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors",
        isOwn ? "bg-white/15 hover:bg-white/25" : "bg-white/60 hover:bg-white/80 dark:bg-white/5 dark:hover:bg-white/10"
      )}
    >
      <FileText className={cn("h-8 w-8 shrink-0", isOwn ? "text-white" : "text-indigo-500 dark:text-indigo-400")} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-semibold", isOwn ? "text-white" : "text-zinc-800 dark:text-zinc-100")}>
          {attachment.name}
        </span>
        <span className={cn("block text-xs", isOwn ? "text-white/70" : "text-zinc-400 dark:text-zinc-500")}>
          {formatBytes(attachment.size)}
        </span>
      </span>
      <Download className={cn("h-4 w-4 shrink-0", isOwn ? "text-white/80" : "text-zinc-400 dark:text-zinc-500")} />
    </a>
  );
}

export function ChatClient({
  rooms,
  initialRoom,
  initialMessages,
  initialMention,
  currentUser,
}: {
  rooms: ChatRoom[];
  initialRoom: ChatRoom;
  initialMessages: ChatMessage[];
  initialMention?: string | null;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const [activeRoom, setActiveRoom] = useState<ChatRoom>(initialRoom);
  const [messagesByRoom, setMessagesByRoom] = useState<Partial<Record<ChatRoom, ChatMessage[]>>>({
    [initialRoom]: initialMessages,
  });
  // "?mention=username" dari Kantor Virtual -- diisi lewat NILAI AWAL
  // state (bukan setState di dalam effect, yang dilarang linter
  // react-hooks/set-state-in-effect versi terbaru), jadi composer sudah
  // terisi "@username " tepat di render pertama.
  const [composerText, setComposerText] = useState(initialMention ? `@${initialMention} ` : "");
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [suggestions, setSuggestions] = useState<TaggableUser[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // "Waktu sekarang" buat canEditOwn di bawah -- WAJIB lewat state (bukan
  // baca Date.now() langsung saat render, dan bukan pula baca ref.current
  // saat render -- dua-duanya baru dilarang linter react-hooks versi
  // terbaru: purity & refs). Nilai awal dari lazy initializer (cuma jalan
  // SEKALI saat mount, jadi aman), lalu di-refresh tiap 30 detik lewat
  // effect di bawah supaya tombol edit/hapus otomatis hilang begitu lewat
  // jendela 15 menit (EDIT_DELETE_WINDOW_MS) tanpa pengguna perlu berinteraksi.
  const [now, setNow] = useState(() => Date.now());

  const cursorRef = useRef<Partial<Record<ChatRoom, string | null>>>({
    [initialRoom]: initialMessages.length > 0 ? initialMessages.reduce((max, m) => {
      const t = latestActivityIso(m);
      return t > max ? t : max;
    }, initialMessages[0].createdAt) : null,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ditempel ke elemen <li> penanda "akhir daftar" (lihat JSX di bawah) —
  // tipe generic-nya WAJIB cocok elemen aslinya, bukan sembarang elemen,
  // supaya tidak jadi error tipe saat build production (`tsc` Vercel jauh
  // lebih ketat dari pengecekan sintaks esbuild di sandbox ini).
  const bottomRef = useRef<HTMLLIElement>(null);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = messagesByRoom[activeRoom] ?? [];

  // Muat pesan awal ruang yang BELUM pernah dibuka sejak halaman ini mount
  // (tab lain sudah dibawa dari server lewat `initialMessages`).
  useEffect(() => {
    if (messagesByRoom[activeRoom] !== undefined) return;
    let cancelled = false;
    (async () => {
      const { messages: fetched } = await getChatMessages(activeRoom, null);
      if (cancelled) return;
      cursorRef.current[activeRoom] =
        fetched.length > 0 ? fetched.reduce((max, m) => (latestActivityIso(m) > max ? latestActivityIso(m) : max), fetched[0].createdAt) : null;
      setMessagesByRoom((prev) => ({ ...prev, [activeRoom]: fetched }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom]);

  // Polling ringan (bukan Realtime, sesuai keputusan Owner) — cukup ambil
  // pesan yang lebih baru/berubah dari kursor terakhir tiap ruang aktif.
  // Digabung (upsert, bukan ditempel) lewat mergeMessages supaya edit/hapus
  // pesan LAMA oleh orang lain ikut ter-update di tempatnya.
  useEffect(() => {
    const interval = setInterval(async () => {
      const cursor = cursorRef.current[activeRoom] ?? null;
      const { messages: fresh } = await getChatMessages(activeRoom, cursor);
      if (fresh.length === 0) return;
      cursorRef.current[activeRoom] = fresh.reduce((max, m) => (latestActivityIso(m) > max ? latestActivityIso(m) : max), cursor ?? fresh[0].createdAt);
      setMessagesByRoom((prev) => ({ ...prev, [activeRoom]: mergeMessages(prev[activeRoom] ?? [], fresh) }));
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [activeRoom]);

  // Lihat komentar di deklarasi state `now` di atas.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeRoom]);

  // Deep-link "?mention=username" dari Kantor Virtual -- isi teksnya sudah
  // lewat nilai awal state `composerText` di atas (bukan di sini), effect
  // ini cuma bagian imperatifnya (fokus + taruh kursor di akhir teks),
  // jalan SEKALI saat mount.
  useEffect(() => {
    if (!initialMention) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const pos = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(pos, pos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRoomChange(room: ChatRoom) {
    if (room === activeRoom) return;
    setActiveRoom(room);
    setMention(null);
    setSuggestions([]);
    router.replace(`/dashboard/chat?room=${room}`, { scroll: false });
  }

  function updateMentionState(text: string, cursorPos: number) {
    const next = findMentionAtCursor(text, cursorPos);
    setMention(next);

    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    if (!next) {
      setSuggestions([]);
      return;
    }
    mentionDebounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const results = await searchTaggableUsers(next.query);
        setSuggestions(results);
      });
    }, MENTION_DEBOUNCE_MS);
  }

  function handleComposerChange(text: string) {
    setComposerText(text);
    updateMentionState(text, textareaRef.current?.selectionStart ?? text.length);
  }

  function applyMention(user: TaggableUser) {
    if (!mention) return;
    const before = composerText.slice(0, mention.start);
    const after = composerText.slice(mention.start + 1 + mention.query.length);
    const inserted = `@${user.username} `;
    const newText = `${before}${inserted}${after}`;
    setComposerText(newText);
    setMention(null);
    setSuggestions([]);

    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && mention) {
      setMention(null);
      setSuggestions([]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && suggestions.length === 0) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleFileSelect(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Ukuran file maksimal 10MB.");
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      setError("Tipe file tidak didukung. Gunakan foto (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel).");
      return;
    }

    setError(null);
    setSelectedFile(file);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  }

  function removeSelectedFile() {
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Cegah kebocoran memori dari object URL preview gambar kalau komponen ini
  // unmount sementara masih ada file terpilih yang belum dikirim.
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sesuai keputusan Owner: pengirim boleh edit/hapus pesannya SENDIRI
  // selama masih dalam 15 menit sejak terkirim; akses penuh boleh menghapus
  // pesan SIAPA PUN kapan saja (moderasi), tapi TIDAK boleh mengedit teks
  // orang lain. Dicek ulang tiap 30 detik lewat `forceTick` (lihat atas)
  // supaya tombolnya otomatis hilang begitu lewat jendela waktu.
  function canEditOwn(msg: ChatMessage): boolean {
    return (
      msg.senderId === currentUser.id &&
      !msg.deletedAt &&
      now - new Date(msg.createdAt).getTime() < EDIT_DELETE_WINDOW_MS
    );
  }
  function canDeleteMsg(msg: ChatMessage): boolean {
    return !msg.deletedAt && (canEditOwn(msg) || currentUser.division === "all");
  }

  function startReply(msg: ChatMessage) {
    setEditingId(null);
    setReplyTarget(msg);
    textareaRef.current?.focus();
  }

  function startEdit(msg: ChatMessage) {
    setReplyTarget(null);
    setEditingId(msg.id);
    setEditText(msg.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(id: string) {
    if (savingEdit) return;
    setSavingEdit(true);
    setError(null);
    const result = await editChatMessage(id, editText);
    setSavingEdit(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessagesByRoom((prev) => ({ ...prev, [activeRoom]: mergeMessages(prev[activeRoom] ?? [], [result.message]) }));
    cancelEdit();
  }

  function handleDeleteMessage(id: string) {
    setDeleteTarget(id);
  }

  async function confirmDeleteMessage() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    const result = await deleteChatMessage(id);
    if (!result.ok) {
      setError(result.error);
      setDeleteTarget(null);
      return;
    }
    // Optimistis di klien sendiri — polling (dan upsert-nya) tetap akan
    // menyinkronkan versi resminya dari server, termasuk ke tab lain.
    setMessagesByRoom((prev) => ({
      ...prev,
      [activeRoom]: (prev[activeRoom] ?? []).map((m) =>
        m.id === id ? { ...m, body: "", attachment: null, deletedAt: new Date().toISOString() } : m
      ),
    }));
    setDeleteTarget(null);
  }

  async function handleClearRoom() {
    if (clearing) return;
    setClearing(true);
    setError(null);
    const result = await clearChatRoom(activeRoom);
    setClearing(false);
    setClearConfirmOpen(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessagesByRoom((prev) => ({ ...prev, [activeRoom]: [] }));
    cursorRef.current[activeRoom] = null;
  }

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = composerText.trim();
    if ((!text && !selectedFile) || sending) return;

    setSending(true);
    setError(null);

    let fileFormData: FormData | undefined;
    if (selectedFile) {
      const prepared = await prepareUploadFiles([selectedFile]);
      if (!prepared.ok) {
        setSending(false);
        setError(prepared.error);
        return;
      }
      fileFormData = new FormData();
      fileFormData.set("file", prepared.files[0]);
    }

    const result = await sendChatMessage(activeRoom, text, fileFormData, replyTarget?.id ?? null);
    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setComposerText("");
    removeSelectedFile();
    setReplyTarget(null);
    cursorRef.current[activeRoom] = latestActivityIso(result.message);
    setMessagesByRoom((prev) => ({ ...prev, [activeRoom]: [...(prev[activeRoom] ?? []), result.message] }));
  }

  return (
    <div className={cn("flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border", GLASS_SURFACE, GLASS_BORDER)}>
      <div className={cn("flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3", GLASS_BORDER)}>
        <div className="flex gap-2 overflow-x-auto">
          {rooms.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => handleRoomChange(room)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                activeRoom === room
                  ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : cn("text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-white/10", GLASS_PILL)
              )}
            >
              {CHAT_ROOM_LABELS[room]}
            </button>
          ))}
        </div>

        {/* Hapus Seluruh Chat — cuma akses penuh (dikonfirmasi Owner). */}
        {currentUser.division === "all" && (
          <button
            type="button"
            onClick={() => setClearConfirmOpen((v) => !v)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
            aria-label="Hapus seluruh chat di ruang ini"
            title="Hapus seluruh chat di ruang ini"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {clearConfirmOpen && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Yakin hapus SEMUA pesan di ruang &quot;{CHAT_ROOM_LABELS[activeRoom]}&quot;? Tidak bisa dibatalkan.
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setClearConfirmOpen(false)}
              className="rounded-full px-3 py-1 font-semibold text-zinc-500 transition-colors hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleClearRoom}
              disabled={clearing}
              className="rounded-full bg-rose-600 px-3 py-1 font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {clearing ? "Menghapus…" : "Ya, Hapus Semua"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="grid h-full place-items-center text-center text-sm text-zinc-400 dark:text-zinc-500">
            Belum ada pesan di ruang ini. Mulai obrolan pertama!
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((msg) => {
              const isOwn = msg.senderId === currentUser.id;
              const isEditing = editingId === msg.id;
              return (
                <li key={msg.id} className={cn("flex items-end gap-2", isOwn && "flex-row-reverse")}>
                  <div
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                      getAvatarColor(msg.senderName)
                    )}
                    title={msg.senderName}
                  >
                    {getInitials(msg.senderName)}
                  </div>
                  <div className={cn("flex max-w-[80%] flex-col gap-1", isOwn && "items-end")}>
                    {!isOwn && !msg.deletedAt && (
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                          {msg.senderName}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            DIVISION_BADGE_CLASSES[msg.senderDivision]
                          )}
                        >
                          {DIVISION_LABELS[msg.senderDivision]}
                        </span>
                      </div>
                    )}

                    {msg.deletedAt ? (
                      <div className="rounded-2xl px-3.5 py-2 text-sm italic text-zinc-400 dark:text-zinc-500">
                        Pesan telah dihapus
                      </div>
                    ) : isEditing ? (
                      <div className={cn("flex w-64 max-w-full flex-col gap-2 rounded-2xl p-2", GLASS_SURFACE_STRONG)}>
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEdit();
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void saveEdit(msg.id);
                            }
                          }}
                          rows={2}
                          className="w-full resize-none rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-black/20 dark:text-zinc-100"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="grid h-7 w-7 place-items-center rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
                            aria-label="Batal edit"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEdit(msg.id)}
                            disabled={savingEdit}
                            className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            aria-label="Simpan edit"
                          >
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex flex-col gap-1.5 rounded-2xl text-sm",
                          msg.attachment && msg.attachment.type.startsWith("image/") ? "overflow-hidden p-1" : "px-3.5 py-2",
                          isOwn
                            ? "rounded-br-sm bg-indigo-600 text-white"
                            : cn("rounded-bl-sm text-zinc-800 dark:text-zinc-100", GLASS_SURFACE)
                        )}
                      >
                        {msg.replyTo && (
                          <div
                            className={cn(
                              "rounded-lg border-l-2 px-2 py-1 text-xs",
                              msg.attachment && msg.attachment.type.startsWith("image/") && "mx-1 mt-1",
                              isOwn
                                ? "border-white/50 bg-white/15 text-white/80"
                                : "border-indigo-400 bg-black/5 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                            )}
                          >
                            <p className="truncate font-semibold">{msg.replyTo.senderName}</p>
                            <p className="truncate">
                              {msg.replyTo.body || (msg.replyTo.attachmentName ? `📎 ${msg.replyTo.attachmentName}` : "")}
                            </p>
                          </div>
                        )}
                        {msg.attachment && <AttachmentPreview attachment={msg.attachment} isOwn={isOwn} />}
                        {msg.body && (
                          <span className={cn("whitespace-pre-wrap break-words", msg.attachment && "px-2.5 pb-1")}>
                            {renderMessageBody(msg.body)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className={cn("flex items-center gap-1 px-1", isOwn && "flex-row-reverse")}>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {formatTimeID(msg.createdAt)}
                        {msg.editedAt && !msg.deletedAt && " · diedit"}
                      </span>
                      {!msg.deletedAt && !isEditing && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => startReply(msg)}
                            aria-label="Balas"
                            title="Balas"
                            className="grid h-5 w-5 place-items-center rounded text-zinc-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                          >
                            <Reply className="h-3 w-3" />
                          </button>
                          {canEditOwn(msg) && (
                            <button
                              type="button"
                              onClick={() => startEdit(msg)}
                              aria-label="Edit"
                              title="Edit"
                              className="grid h-5 w-5 place-items-center rounded text-zinc-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          {canDeleteMsg(msg) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              aria-label="Hapus"
                              title="Hapus"
                              className="grid h-5 w-5 place-items-center rounded text-zinc-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            <li ref={bottomRef} aria-hidden />
          </ul>
        )}
      </div>

      {error && (
        <p className="shrink-0 border-t border-black/5 px-4 py-2 text-xs font-medium text-rose-600 dark:border-white/10 dark:text-rose-300">
          {error}
        </p>
      )}

      <form onSubmit={handleSend} className={cn("relative shrink-0 border-t p-3", GLASS_BORDER)}>
        {mention && (
          <div
            className={cn(
              "absolute bottom-full left-3 mb-2 w-64 overflow-hidden rounded-xl border shadow-lg shadow-black/10",
              GLASS_SURFACE_STRONG,
              GLASS_BORDER
            )}
          >
            {isSearching && suggestions.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 dark:text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mencari…
              </p>
            ) : suggestions.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-zinc-400 dark:text-zinc-500">Tidak ada username cocok.</p>
            ) : (
              <ul className="max-h-52 overflow-y-auto p-1">
                {suggestions.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => applyMention(user)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
                    >
                      <div
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                          getAvatarColor(user.fullName)
                        )}
                      >
                        {getInitials(user.fullName)}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                          {user.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                          @{user.username}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {replyTarget && (
          <div className={cn("mb-2 flex items-center gap-2.5 rounded-xl border-l-2 border-indigo-500 px-3 py-2", GLASS_PILL)}>
            <Reply className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Membalas {replyTarget.senderName}
              </span>
              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                {replyTarget.body || (replyTarget.attachment ? `📎 ${replyTarget.attachment.name}` : "")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              aria-label="Batal balas"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {selectedFile && (
          <div className={cn("mb-2 flex items-center gap-2.5 rounded-xl border px-3 py-2", GLASS_PILL)}>
            {filePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview lokal dari File API, bukan aset Next.js
              <img src={filePreviewUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <FileText className="h-8 w-8 shrink-0 text-indigo-500 dark:text-indigo-400" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {selectedFile.name}
              </span>
              <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">{formatBytes(selectedFile.size)}</span>
            </span>
            <button
              type="button"
              onClick={removeSelectedFile}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              aria-label="Hapus lampiran"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className={cn(
              "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border text-zinc-500 transition-colors hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-indigo-400",
              GLASS_PILL
            )}
            aria-label="Lampirkan file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={composerText}
            onChange={(e) => handleComposerChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={(e) => updateMentionState(composerText, e.currentTarget.selectionStart)}
            placeholder="Tulis pesan… ketik @ untuk menandai rekan kerja"
            rows={1}
            className={cn(
              "max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-indigo-400 dark:text-zinc-100",
              GLASS_INPUT
            )}
          />
          <button
            type="submit"
            disabled={sending || (composerText.trim().length === 0 && !selectedFile)}
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Kirim"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteMessage}
        title="Hapus Pesan"
        description="Hapus pesan ini? Tindakan ini tidak bisa dibatalkan."
      />
    </div>
  );
}
