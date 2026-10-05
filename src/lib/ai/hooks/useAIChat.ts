"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sendAIMessage, clearAIHistory, getAIMessages, type AIMessage } from "../actions";
import { getDefaultAgent } from "../agents";
import { processImageForAI, isValidImageType, formatFileSize } from "../utils/image";
import type { AIAttachment } from "../types";

export type UseAIChatOptions = {
  /** Load messages on mount (default: false, lazy load when opened) */
  loadOnMount?: boolean;
  /** Initial messages (for SSR) */
  initialMessages?: AIMessage[];
};

export type UseAIChatReturn = {
  // State
  messages: AIMessage[];
  input: string;
  sending: boolean;
  loading: boolean;
  error: string | null;
  selectedImage: File | null;
  imagePreviewUrl: string | null;

  // Actions
  setInput: (value: string) => void;
  send: () => Promise<void>;
  clear: () => Promise<void>;
  loadMessages: () => Promise<void>;
  selectImage: (file: File | null) => void;
  removeImage: () => void;

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const { loadOnMount = false, initialMessages = [] } = options;

  const agent = getDefaultAgent();

  // Message state
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(initialMessages.length > 0);

  // Image state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const loadMessages = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const { messages: m, error: e } = await getAIMessages();
      if (e) {
        setError(e);
      } else {
        setMessages(m);
      }
    } catch {
      setError("Gagal memuat riwayat");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [loaded]);

  // Muat riwayat saat mount kalau diminta -- fetch langsung + penanda batal
  // (bukan memanggil loadMessages, yang men-set state secara sinkron di
  // dalam effect). Status "memuat" untuk muatan awal ini diturunkan dari
  // loadOnMount && !loaded, lihat `loading` di return.
  useEffect(() => {
    if (!loadOnMount || loaded) return;
    let cancelled = false;
    getAIMessages()
      .then(({ messages: m, error: e }) => {
        if (cancelled) return;
        if (e) setError(e);
        else setMessages(m);
      })
      .catch(() => {
        if (!cancelled) setError("Gagal memuat riwayat");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOnMount, loaded]);

  const selectImage = useCallback((file: File | null) => {
    // Cleanup previous preview
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }

    if (!file) {
      setSelectedImage(null);
      return;
    }

    // Validate
    if (!isValidImageType(file)) {
      setError("Format gambar tidak didukung. Gunakan JPEG, PNG, atau WebP.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Ukuran gambar terlalu besar (max 10MB).");
      return;
    }

    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setError(null);
  }, [imagePreviewUrl]);

  const removeImage = useCallback(() => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [imagePreviewUrl]);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedImage) || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    // Process image to base64 if selected
    let imageBase64: string | undefined;
    let attachment: AIAttachment | undefined;

    if (selectedImage) {
      try {
        imageBase64 = await processImageForAI(selectedImage);
        attachment = {
          type: "image",
          url: imageBase64,
          name: selectedImage.name,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memproses gambar");
        setSending(false);
        return;
      }
    }

    // Optimistic add user message
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: AIMessage = {
      id: tempId,
      role: "user",
      content: text || "(gambar)",
      createdAt: new Date().toISOString(),
      attachment,
    };
    setMessages((m) => [...m, optimisticMessage]);

    // Clear image after adding to message
    removeImage();

    // Send to AI
    const res = await sendAIMessage(text, agent.id, imageBase64);
    setSending(false);

    if (res.error) {
      setError(res.error);
      setMessages((m) => m.filter((msg) => msg.id !== tempId));
      setInput(text);
    } else if (res.message) {
      setMessages((m) => [
        ...m.filter((msg) => msg.id !== tempId),
        { ...optimisticMessage, id: `u-${Date.now()}` },
        res.message,
      ]);
    }
  }, [input, selectedImage, sending, agent.id, removeImage]);

  const clear = useCallback(async () => {
    await clearAIHistory();
    setMessages([]);
    setError(null);
    removeImage();
  }, [removeImage]);

  return {
    messages,
    input,
    sending,
    loading: loading || (loadOnMount && !loaded),
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
  };
}

export { formatFileSize };
