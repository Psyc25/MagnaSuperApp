"use client";

import { Loader2, Send, X, ImagePlus } from "lucide-react";
import { useAIChat, formatFileSize } from "@/lib/ai/hooks/useAIChat";
import { AI_BRANDING } from "@/lib/ai/constants";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

export function AIFloatingChat() {
  const [open, setOpen] = useState(false);

  const {
    messages,
    input,
    sending,
    loading,
    error,
    selectedImage,
    imagePreviewUrl,
    setInput,
    send,
    clear,
    loadMessages,
    selectImage,
    removeImage,
    inputRef,
    endRef,
    fileInputRef,
  } = useAIChat();

  // Load messages when first opened
  useEffect(() => {
    if (open) loadMessages();
  }, [open, loadMessages]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, inputRef]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) selectImage(file);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95",
          `bg-gradient-to-br ${AI_BRANDING.color} text-white`
        )}
        title={`Buka ${AI_BRANDING.name}`}
      >
        <span className="text-2xl">{AI_BRANDING.icon}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[480px] w-[360px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white", AI_BRANDING.color)}>
            {AI_BRANDING.icon}
          </span>
          <div className="text-left">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{AI_BRANDING.name}</p>
            <p className="text-[10px] text-emerald-600">● Online</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={clear} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800" title="Hapus riwayat">
            🗑️
          </button>
          <button onClick={() => setOpen(false)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">{AI_BRANDING.icon}</span>
            <p className="mt-2 text-sm text-zinc-500">Halo! Saya {AI_BRANDING.name}</p>
            <p className="text-xs text-zinc-400">{AI_BRANDING.shortDescription}</p>
            <p className="mt-2 text-[10px] text-zinc-400">📷 Bisa kirim foto struk untuk input otomatis</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white",
                  m.role === "user" ? "bg-indigo-500" : `bg-gradient-to-br ${AI_BRANDING.color}`
                )}>
                  {m.role === "user" ? "👤" : AI_BRANDING.icon}
                </div>
                <div className={cn(
                  "max-w-[75%] rounded-xl px-3 py-2 text-xs",
                  m.role === "user"
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                )}>
                  {/* Show image attachment if present */}
                  {m.attachment?.type === "image" && (
                    <img
                      src={m.attachment.url}
                      alt={m.attachment.name || "Gambar"}
                      className="mb-1 max-h-32 rounded-lg object-contain"
                    />
                  )}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs text-white bg-gradient-to-br", AI_BRANDING.color)}>
                  {AI_BRANDING.icon}
                </div>
                <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="border-t bg-rose-50 px-3 py-1.5 text-[10px] text-rose-600 dark:bg-rose-900/20">{error}</p>}

      {/* Image Preview */}
      {selectedImage && imagePreviewUrl && (
        <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            <img src={imagePreviewUrl} alt="" className="h-10 w-10 rounded object-cover" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium">{selectedImage.name}</p>
              <p className="text-[10px] text-zinc-400">{formatFileSize(selectedImage.size)}</p>
            </div>
            <button onClick={removeImage} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Image button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-violet-500 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="Kirim gambar"
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={selectedImage ? "Tambah keterangan..." : `Tanya ${AI_BRANDING.name}...`}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs outline-none focus:border-violet-400 disabled:opacity-50 dark:border-zinc-700"
          />
          <button
            onClick={send}
            disabled={(!input.trim() && !selectedImage) || sending}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-white transition disabled:opacity-50",
              `bg-gradient-to-br ${AI_BRANDING.color}`
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
