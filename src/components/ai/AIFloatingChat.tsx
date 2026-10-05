"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Loader2, Send, X } from "lucide-react";
import { sendAIMessage, clearAIHistory, getAIMessages, type AIMessage } from "@/lib/ai/actions";
import { AI_AGENTS, getDefaultAgent, type AIAgent } from "@/lib/ai/agents";
import { cn } from "@/lib/cn";

export function AIFloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AIAgent>(getDefaultAgent());
  const [showPicker, setShowPicker] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Load messages saat pertama kali buka
  useEffect(() => {
    if (open && !loaded) {
      setLoading(true);
      getAIMessages()
        .then(({ messages: m }) => setMessages(m))
        .catch(() => setError("Gagal memuat riwayat"))
        .finally(() => {
          setLoading(false);
          setLoaded(true);
        });
    }
  }, [open, loaded]);

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  // Focus input saat buka
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, showPicker]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    // Optimistic add
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95",
          `bg-gradient-to-br ${agent.color} text-white`
        )}
        title="Buka AI Assistant"
      >
        <span className="text-2xl">{agent.icon}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[480px] w-[360px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white", agent.color)}>
            {agent.icon}
          </span>
          <div className="text-left">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</p>
            <p className="text-[10px] text-emerald-600">● Online</p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition", showPicker && "rotate-180")} />
        </button>
        <div className="flex gap-1">
          <button onClick={clear} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800" title="Hapus">
            🗑️
          </button>
          <button onClick={() => setOpen(false)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Agent Picker */}
      {showPicker && (
        <div className="max-h-40 overflow-y-auto border-b border-zinc-100 p-2 dark:border-zinc-800">
          {AI_AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAgent(a); setShowPicker(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                agent.id === a.id ? "bg-violet-100 dark:bg-violet-900/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-xs text-white", a.color)}>
                {a.icon}
              </span>
              <div className="flex-1 truncate">
                <p className="text-xs font-medium text-zinc-900 dark:text-white">{a.name}</p>
                <p className="text-[10px] text-zinc-500">{a.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">{agent.icon}</span>
            <p className="mt-2 text-sm text-zinc-500">Halo! Saya {agent.name}</p>
            <p className="text-xs text-zinc-400">{agent.description}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white",
                  m.role === "user" ? "bg-indigo-500" : `bg-gradient-to-br ${agent.color}`
                )}>
                  {m.role === "user" ? "👤" : agent.icon}
                </div>
                <div className={cn(
                  "max-w-[75%] rounded-xl px-3 py-2 text-xs",
                  m.role === "user"
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                )}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs text-white bg-gradient-to-br", agent.color)}>
                  {agent.icon}
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

      {/* Input */}
      <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Tanya ${agent.name}...`}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-xs outline-none focus:border-violet-400 disabled:opacity-50 dark:border-zinc-700"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-white transition disabled:opacity-50",
              `bg-gradient-to-br ${agent.color}`
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
