"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { sendAIMessage, clearAIHistory, type AIMessage } from "@/lib/ai/actions";
import { getDefaultAgent } from "@/lib/ai/agents";
import { AI_BRANDING } from "@/lib/ai/constants";
import { cn } from "@/lib/cn";

export function AIAssistantClient({
  initialMessages,
  userName,
}: {
  initialMessages: AIMessage[];
  userName: string;
}) {
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Internal agent (tidak ditampilkan ke user)
  const agent = getDefaultAgent();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    const tempId = `temp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() }]);

    const res = await sendAIMessage(text, agent.id);
    setSending(false);

    if (res.error) {
      setError(res.error);
      setMessages((m) => m.filter((msg) => msg.id !== tempId));
      setInput(text);
    } else if (res.message) {
      setMessages((m) => [...m.filter((msg) => msg.id !== tempId),
        { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() },
        res.message
      ]);
    }
  }

  async function clear() {
    await clearAIHistory();
    setMessages([]);
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

      {/* Input */}
      <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Tanya ${AI_BRANDING.name}...`}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none focus:border-violet-400 disabled:opacity-50 dark:border-zinc-700"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
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
