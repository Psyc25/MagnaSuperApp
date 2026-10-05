"use client";

import { useEffect } from "react";
import { Loader2, Send, Trash2, ImagePlus, X } from "lucide-react";
import { type AIMessage } from "@/lib/ai/actions";
import { useAIChat, formatFileSize } from "@/lib/ai/hooks/useAIChat";
import { AI_BRANDING } from "@/lib/ai/constants";
import { cn } from "@/lib/cn";

export function AIAssistantClient({
  initialMessages,
  userName,
}: {
  initialMessages: AIMessage[];
  userName: string;
}) {
  const {
    messages,
    input,
    sending,
    error,
    selectedImage,
    imagePreviewUrl,
    setInput,
    send,
    clear,
    selectImage,
    removeImage,
    inputRef,
    endRef,
    fileInputRef,
  } = useAIChat({ initialMessages });

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, endRef]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) selectImage(file);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-xl text-white", AI_BRANDING.color)}>
            {AI_BRANDING.icon}
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-zinc-900 dark:text-white">{AI_BRANDING.name}</p>
            <p className="text-xs text-zinc-500">{AI_BRANDING.description}</p>
          </div>
        </div>
        <button onClick={clear} className="rounded-full p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20" title="Hapus riwayat">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-6xl">{AI_BRANDING.icon}</span>
            <p className="mt-3 font-medium text-zinc-600 dark:text-zinc-300">Halo {userName}!</p>
            <p className="text-sm text-zinc-400">Saya {AI_BRANDING.name}. {AI_BRANDING.shortDescription}</p>
            <p className="mt-3 text-xs text-zinc-400">📷 Kirim foto struk/nota untuk input otomatis ke sistem</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                  m.role === "user" ? "bg-indigo-500" : `bg-gradient-to-br ${AI_BRANDING.color}`
                )}>
                  {m.role === "user" ? "👤" : AI_BRANDING.icon}
                </div>
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                  m.role === "user"
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                )}>
                  {/* Show image attachment if present */}
                  {m.attachment?.type === "image" && (
                    <img
                      src={m.attachment.url}
                      alt={m.attachment.name || "Gambar"}
                      className="mb-2 max-h-48 rounded-lg object-contain"
                    />
                  )}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-white bg-gradient-to-br", AI_BRANDING.color)}>
                  {AI_BRANDING.icon}
                </div>
                <div className="rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {AI_BRANDING.name} mengetik...
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="border-t bg-rose-50 px-4 py-2 text-xs text-rose-600 dark:bg-rose-900/20">{error}</p>}

      {/* Image Preview */}
      {selectedImage && imagePreviewUrl && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
            <img src={imagePreviewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{selectedImage.name}</p>
              <p className="text-xs text-zinc-400">{formatFileSize(selectedImage.size)}</p>
            </div>
            <button onClick={removeImage} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex gap-3">
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
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-violet-500 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="Kirim gambar (struk, nota, dll)"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={selectedImage ? "Tambah keterangan..." : `Tanya ${AI_BRANDING.name}...`}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-violet-400 disabled:opacity-50 dark:border-zinc-700"
          />
          <button
            onClick={send}
            disabled={(!input.trim() && !selectedImage) || sending}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl text-white transition disabled:opacity-50",
              `bg-gradient-to-br ${AI_BRANDING.color}`
            )}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
