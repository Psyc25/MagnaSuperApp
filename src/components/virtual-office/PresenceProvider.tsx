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
  myLook: AvatarLook;
  myStatus: PresenceStatus | null;
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
  const trackedRef = useRef<PresenceMeta>({ inOffice: false, status: null });
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [presenceMeta, setPresenceMeta] = useState<Map<string, ResolvedPresence>>(new Map());
  const [myLook, setMyLook] = useState<AvatarLook>(() => defaultLook(userId));
  const [myStatus, setMyStatus] = useState<PresenceStatus | null>(null);

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

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const ids = Object.keys(state);
      const meta = new Map<string, ResolvedPresence>();
      for (const id of ids) {
        const m = state[id]?.[state[id].length - 1];
        meta.set(id, {
          look: sanitizeLook(m?.look, id),
          inOffice: m?.inOffice === true,
          status: m?.status ?? null,
        });
      }
      setOnlineIds(ids);
      setPresenceMeta(meta);
      for (const id of Array.from(remoteRef.current.keys())) {
        if (!ids.includes(id)) remoteRef.current.delete(id);
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

  const updatePresence = useCallback(
    (patch: Partial<Pick<PresenceMeta, "look" | "inOffice" | "status">>) => {
      trackedRef.current = { ...trackedRef.current, ...patch };
      if (patch.look) setMyLook(sanitizeLook(patch.look, userId));
      if ("status" in patch) setMyStatus(patch.status ?? null);
      channelRef.current?.track({ onlineAt: new Date().toISOString(), ...trackedRef.current });
    },
    [userId]
  );

  const value = useMemo<ContextValue>(
    () => ({ channelRef, remoteRef, onlineIds, presenceMeta, myLook, myStatus, broadcastMove, updatePresence }),
    [onlineIds, presenceMeta, myLook, myStatus, broadcastMove, updatePresence]
  );

  return <VirtualOfficePresenceContext.Provider value={value}>{children}</VirtualOfficePresenceContext.Provider>;
}
