"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { sanitizeLook, defaultLook, type AvatarLook } from "@/lib/virtual-office/avatar-look";
import type { Dir, RemotePos } from "@/lib/virtual-office/house";
import {
  VIRTUAL_OFFICE_CHANNEL,
  type ActionPayload,
  type AvatarActionKind,
  type EmotePayload,
  type InteractPayload,
  type PresenceMeta,
  type PresenceStatus,
  type ResolvedPresence,
} from "@/lib/virtual-office/presence";

/**
 * Presence Kantor Virtual dipasang SEKALI di AppShell (semua halaman
 * dashboard) -- lihat presence.ts untuk alasannya. Komponen ini yang
 * benar-benar memegang channel Supabase Realtime-nya; VirtualOfficeClient
 * (halaman Kantor Virtual) cuma konsumsi lewat useVirtualOfficePresence(),
 * tidak bikin channel sendiri.
 */
type ContextValue = {
  channelRef: { current: RealtimeChannel | null };
  onlineIds: string[];
  presenceMeta: Map<string, ResolvedPresence>;
  /** Posisi live orang lain yang SEDANG di halaman Kantor Virtual --
   * diisi lewat broadcast "move" yang didengarkan di sini (bukan di
   * VirtualOfficeClient) supaya listener-nya pasti terpasang SEBELUM
   * channel.subscribe() (Supabase: binding broadcast/presence yang
   * ditambah setelah subscribe tidak terjamin ikut diproses). */
  remoteRef: { current: Map<string, RemotePos> };
  broadcastMove: (x: number, y: number, dir: Dir) => void;
  /** Emote/chat bubble ephemeral orang lain -- key userId, value kadaluarsa
   * sendiri lewat `at` (lihat EMOTE_DURATION_MS), dibaca per-frame oleh
   * loop gambar avatar sama seperti remoteRef dipakai utk posisi live. */
  remoteEmoteRef: { current: Map<string, { content: string; at: number }> };
  broadcastEmote: (content: string) => void;
  /** Aksi gestur avatar orang lain (Opsi B, gap Oktober 2026) -- key
   * userId, value kadaluarsa sendiri lewat `at` (lihat ACTION_ANIM_MS),
   * dibaca per-frame sama seperti remoteEmoteRef. */
  remoteActionRef: { current: Map<string, { action: AvatarActionKind; at: number }> };
  broadcastAction: (action: AvatarActionKind) => void;
  /** Perabot yang sedang dipakai orang lain (lihat interactions.ts) --
   * key userId, value furnitureId atau null (tidak memakai apa-apa).
   * BEDA dari remoteEmoteRef/remoteActionRef: ini status toggle, bukan
   * animasi sesaat, jadi dibaca langsung tanpa cek kadaluarsa `at`. */
  remoteInteractRef: { current: Map<string, string | null> };
  broadcastInteract: (furnitureId: string | null) => void;
  myLook: AvatarLook;
  myStatus: PresenceStatus;
  /** Gabungkan field ke presence milik sendiri lalu track() ulang --
   * dipakai utk pindah inOffice, ganti status, simpan karakter baru. */
  updatePresence: (patch: Partial<Pick<PresenceMeta, "look" | "inOffice" | "status">>) => void;
};

const VirtualOfficePresenceContext = createContext<ContextValue | null>(null);

export function useVirtualOfficePresence(): ContextValue {
  const ctx = useContext(VirtualOfficePresenceContext);
  if (!ctx) {
    throw new Error("useVirtualOfficePresence dipanggil di luar VirtualOfficePresenceProvider");
  }
  return ctx;
}
export function VirtualOfficePresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remoteRef = useRef<Map<string, RemotePos>>(new Map());
  const remoteEmoteRef = useRef<Map<string, { content: string; at: number }>>(new Map());
  const remoteActionRef = useRef<Map<string, { action: AvatarActionKind; at: number }>>(new Map());
  const remoteInteractRef = useRef<Map<string, string | null>>(new Map());
  const trackedRef = useRef<PresenceMeta>({ inOffice: false, status: null });
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [presenceMeta, setPresenceMeta] = useState<Map<string, ResolvedPresence>>(new Map());
  const [myLook, setMyLook] = useState<AvatarLook>(() => defaultLook(userId));
  const [myStatus, setMyStatus] = useState<PresenceStatus>("available");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel(VIRTUAL_OFFICE_CHANNEL, {
      config: { broadcast: { self: false }, presence: { key: userId } },
    });

    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      const p = payload as { id: string; x: number; y: number; dir: Dir };
      if (p.id === userId) return;
      remoteRef.current.set(p.id, { x: p.x, y: p.y, dir: p.dir });
    });

    channel.on("broadcast", { event: "emote" }, ({ payload }) => {
      const p = payload as EmotePayload;
      if (p.id === userId) return;
      remoteEmoteRef.current.set(p.id, { content: p.content, at: Date.now() });
    });

    channel.on("broadcast", { event: "action" }, ({ payload }) => {
      const p = payload as ActionPayload;
      if (p.id === userId) return;
      remoteActionRef.current.set(p.id, { action: p.action, at: Date.now() });
    });

    channel.on("broadcast", { event: "interact" }, ({ payload }) => {
      const p = payload as InteractPayload;
      if (p.id === userId) return;
      remoteInteractRef.current.set(p.id, p.furnitureId);
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const ids = Object.keys(state);
      const meta = new Map<string, ResolvedPresence>();
      for (const id of ids) {
        const m = state[id]?.[state[id].length - 1];
        meta.set(id, {
          look: sanitizeLook(m?.look, id),
          inOffice: m?.inOffice === true,
          status: m?.status ?? "available",
        });
      }
      setOnlineIds(ids);
      setPresenceMeta(meta);
      for (const id of Array.from(remoteRef.current.keys())) {
        if (!ids.includes(id)) remoteRef.current.delete(id);
      }
      for (const id of Array.from(remoteInteractRef.current.keys())) {
        if (!ids.includes(id)) remoteInteractRef.current.delete(id);
      }
    });
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      channelRef.current = channel;
      channel.track({ onlineAt: new Date().toISOString(), ...trackedRef.current });
    });

    // Tampilan karakter tersimpan di user_metadata (lihat actions.ts
    // saveAvatarLook), diambil di sini supaya avatar "online di tempat
    // lain" orang ini terlihat benar oleh orang lain walau dia tidak
    // pernah membuka halaman Kantor Virtual sekalipun.
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const raw = (data.user?.user_metadata as { avatar_look?: unknown } | undefined)?.avatar_look;
      const look = sanitizeLook(raw, userId);
      setMyLook(look);
      trackedRef.current = { ...trackedRef.current, look };
      channelRef.current?.track({ onlineAt: new Date().toISOString(), ...trackedRef.current });
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);
  const broadcastMove = useCallback(
    (x: number, y: number, dir: Dir) => {
      channelRef.current?.send({ type: "broadcast", event: "move", payload: { id: userId, x, y, dir } });
    },
    [userId]
  );

  const broadcastEmote = useCallback(
    (content: string) => {
      channelRef.current?.send({ type: "broadcast", event: "emote", payload: { id: userId, content } });
    },
    [userId]
  );

  const broadcastAction = useCallback(
    (action: AvatarActionKind) => {
      channelRef.current?.send({ type: "broadcast", event: "action", payload: { id: userId, action } });
    },
    [userId]
  );

  const broadcastInteract = useCallback(
    (furnitureId: string | null) => {
      channelRef.current?.send({ type: "broadcast", event: "interact", payload: { id: userId, furnitureId } });
    },
    [userId]
  );

  const updatePresence = useCallback(
    (patch: Partial<Pick<PresenceMeta, "look" | "inOffice" | "status">>) => {
      trackedRef.current = { ...trackedRef.current, ...patch };
      if (patch.look) setMyLook(sanitizeLook(patch.look, userId));
      if (patch.status) setMyStatus(patch.status);
      channelRef.current?.track({ onlineAt: new Date().toISOString(), ...trackedRef.current });
    },
    [userId]
  );

  const value = useMemo<ContextValue>(
    () => ({
      channelRef,
      remoteRef,
      remoteEmoteRef,
      remoteActionRef,
      remoteInteractRef,
      onlineIds,
      presenceMeta,
      myLook,
      myStatus,
      broadcastMove,
      broadcastEmote,
      broadcastAction,
      broadcastInteract,
      updatePresence,
    }),
    [onlineIds, presenceMeta, myLook, myStatus, broadcastMove, broadcastEmote, broadcastAction, broadcastInteract, updatePresence]
  );

  return <VirtualOfficePresenceContext.Provider value={value}>{children}</VirtualOfficePresenceContext.Provider>;
}
