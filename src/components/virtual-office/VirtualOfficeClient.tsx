"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  BedDouble,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  DoorClosed,
  MapPin,
  MessageSquare,
  Palette,
  Rabbit,
  Send,
  Smile,
  Users,
  Zap,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/cn";
import type { ChatRoom } from "@/lib/chat/rooms";
import { CHAT_ROOM_LABELS } from "@/lib/chat/rooms";
import type { Division } from "@/lib/supabase/types";
import type { OfficeRosterEntry } from "@/lib/virtual-office/data";
import type { AvatarLook } from "@/lib/virtual-office/avatar-look";
import {
  AGENT_NPC_POSITIONS,
  FLOOR2_BOUNDS,
  FLOOR2_OFFSET_X,
  GROUND_BOUNDS,
  OWNER_DOOR_CENTER,
  OWNER_ROOM_USER_IDS,
  PLAYER_SPEED,
  ROOMS,
  SPAWN,
  SPRINT_MULTIPLIER,
  blockersFor,
  canEnterOwnerRoom,
  chatRoomFor,
  deskForDivision,
  getRoom,
  getRoomAt,
  isUpstairs,
  resolveMove,
  sleepSlot,
  stairsTeleport,
  type Pos,
  type RoomId,
} from "@/lib/virtual-office/house";
import { getAgentById, type AIAgent } from "@/lib/ai/agents";
import {
  EMOTE_DURATION_MS,
  QUICK_EMOTES,
  STATUS_COLORS,
  STATUS_LABELS,
  type PresenceStatus,
} from "@/lib/virtual-office/presence";
import { HouseScene, toScene } from "./HouseScene";
import { AgentNPC, DeskAvatar, PlayerAvatar, RemoteAvatar, SleeperAvatar, type Dir, type RemotePos } from "./Avatars";
import { CharacterEditor } from "./CharacterEditor";
import { useVirtualOfficePresence } from "./PresenceProvider";

/**
 * Kantor Virtual v4 -- "Rumah Magna" (denah & aturan di
 * src/lib/virtual-office/house.ts). Rekan yang sedang membuka aplikasi
 * tampil online dan berjalan di rumah; yang tidak membuka aplikasi tidur di
 * kasurnya di Kamar Staff. Tiap orang bisa mengubah karakternya sendiri.
 */

const BROADCAST_INTERVAL_MS = 70;
const INTERACTION_RADIUS = 55;
const CAMERA_OFFSET = { x: 0, y: 260, z: 210 };

type CurrentUser = {
  id: string;
  fullName: string;
  username: string | null;
  division: Division;
  look: AvatarLook;
};

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function pickChatTarget(me: Division, other: OfficeRosterEntry): { room: ChatRoom; mention?: string } | null {
  if (me === "investor" || other.division === "investor") return null;
  const room: ChatRoom =
    me === other.division && (me === "magnarent" || me === "magnative" || me === "production") ? me : "bersama";
  return { room, mention: other.username ?? undefined };
}

export function VirtualOfficeClient({
  currentUser,
  roster,
}: {
  currentUser: CurrentUser;
  roster: OfficeRosterEntry[];
}) {
  const rosterById = useMemo(() => new Map(roster.map((r) => [r.id, r])), [roster]);
  const blockers = useMemo(() => blockersFor(currentUser.id), [currentUser.id]);
  const isOwner = canEnterOwnerRoom(currentUser.id);
  const ownerEntry = useMemo(
    () => roster.find((r) => OWNER_ROOM_USER_IDS.includes(r.id)) ?? null,
    [roster]
  );

  const { onlineIds, presenceMeta, remoteRef, remoteEmoteRef, broadcastMove, broadcastEmote, myStatus, updatePresence } =
    useVirtualOfficePresence();

  const posRef = useRef<Pos>({ ...SPAWN });
  const dirRef = useRef<Dir>("up");
  const keysRef = useRef<Set<string>>(new Set());

  const [look, setLook] = useState<AvatarLook>(currentUser.look);
  const [savedLook, setSavedLook] = useState<AvatarLook>(currentUser.look);
  const [editing, setEditing] = useState(false);
  const [roomId, setRoomId] = useState<RoomId | undefined>(undefined);
  const [nearby, setNearby] = useState<OfficeRosterEntry | null>(null);
  const [nearbyAgent, setNearbyAgent] = useState<AIAgent | null>(null);
  const [nearOwnerDoor, setNearOwnerDoor] = useState(false);
  const [myEmote, setMyEmote] = useState<string | null>(null);
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  const [emoteDraft, setEmoteDraft] = useState("");
  const myEmoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNearbyIdRef = useRef<string | null>(null);

  // Begitu halaman Kantor Virtual dibuka, tandai presence sendiri
  // "inOffice: true" (avatar ikut berjalan live di peta semua orang) --
  // dan balikin ke false saat keluar halaman ini (avatar jadi diam di meja
  // divisinya, tapi tetap "online" selama aplikasi masih dibuka di halaman
  // lain). Channel Supabase-nya sendiri sudah hidup di PresenceProvider
  // (AppShell) sejak aplikasi dibuka, jadi di sini cuma update flag.
  useEffect(() => {
    updatePresence({ inOffice: true });
    return () => updatePresence({ inOffice: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard (diabaikan saat mengetik di input).
  useEffect(() => {
    const MOVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "shift") {
        keysRef.current.add("shift");
        return;
      }
      if (!MOVE_KEYS.has(k)) return;
      if (k.startsWith("arrow")) e.preventDefault();
      keysRef.current.add(k);
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.key.toLowerCase());
    }
    function onBlur() {
      keysRef.current.clear();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const pressVirtual = useCallback((key: string, down: boolean) => {
    if (down) keysRef.current.add(key);
    else keysRef.current.delete(key);
  }, []);

  // Emote/chat bubble ephemeral: tampil di avatar sendiri secara instan
  // (tidak nunggu round-trip broadcast) + dikirim ke semua orang lain lewat
  // channel presence yang sama supaya muncul di avatarnya juga. Bukan chat
  // history -- hilang sendiri setelah EMOTE_DURATION_MS.
  const sendEmote = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (myEmoteTimeoutRef.current) clearTimeout(myEmoteTimeoutRef.current);
      setMyEmote(trimmed);
      broadcastEmote(trimmed);
      myEmoteTimeoutRef.current = setTimeout(() => setMyEmote(null), EMOTE_DURATION_MS);
      setEmotePickerOpen(false);
      setEmoteDraft("");
    },
    [broadcastEmote]
  );

  useEffect(() => {
    return () => {
      if (myEmoteTimeoutRef.current) clearTimeout(myEmoteTimeoutRef.current);
    };
  }, []);

  // Toast "X mendekat" -- numpang pada deteksi `nearby` yang sudah ada di
  // GameLoop (jarak terdekat ke rekan di peta), cuma muncul sekali per
  // transisi null->seseorang atau ganti orang, bukan tiap re-render.
  useEffect(() => {
    if (nearby) {
      if (nearby.id !== prevNearbyIdRef.current) {
        prevNearbyIdRef.current = nearby.id;
        setToast(`${firstName(nearby.fullName)} mendekat`);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
      }
    } else {
      prevNearbyIdRef.current = null;
    }
  }, [nearby]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const handleSaved = useCallback(
    (next: AvatarLook) => {
      setLook(next);
      setSavedLook(next);
      setEditing(false);
      updatePresence({ look: next });
    },
    [updatePresence]
  );

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);
  const sleepers = useMemo(
    () =>
      roster
        .filter((r) => r.id !== currentUser.id && !onlineSet.has(r.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
    [roster, onlineSet, currentUser.id]
  );
  const othersInOffice = onlineIds.filter((id) => id !== currentUser.id && presenceMeta.get(id)?.inOffice);
  const othersElsewhere = onlineIds.filter((id) => id !== currentUser.id && !presenceMeta.get(id)?.inOffice);
  const lookFor = (entry: OfficeRosterEntry) => presenceMeta.get(entry.id)?.look ?? entry.look;

  const room = roomId ? getRoom(roomId) : null;
  const roomChat = chatRoomFor(roomId, currentUser.division);
  const chatTarget = nearby ? pickChatTarget(currentUser.division, nearby) : null;
  const canKnock = nearOwnerDoor && !isOwner && ownerEntry?.username && currentUser.division !== "investor";

  return (
    <div className="select-none space-y-3 [-webkit-touch-callout:none]" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3.5 py-1.5 text-sm font-medium text-white">
            <MapPin className="h-4 w-4 text-violet-400" />
            <span className="font-bold">{room?.label ?? "Halaman"}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3.5 py-1.5 text-sm text-white">
            <Users className="h-4 w-4 text-emerald-400" />
            <span className="font-bold text-emerald-400">{Math.max(onlineIds.length, 1)}</span>
            <span className="text-white/60">online</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3.5 py-1.5 text-sm text-white">
            <BedDouble className="h-4 w-4 text-slate-300" />
            <span className="font-bold">{sleepers.length}</span>
            <span className="text-white/60">tidur</span>
          </span>
          {roomChat && (
            <Link
              href={`/dashboard/chat?room=${roomChat}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-slate-900 shadow"
            >
              <MessageSquare className="h-4 w-4" />
              Chat {CHAT_ROOM_LABELS[roomChat]}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setStatusPickerOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/80 px-3.5 py-1.5 text-sm font-medium text-white"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[myStatus] }} />
              {STATUS_LABELS[myStatus]}
            </button>
            {statusPickerOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-0.5 rounded-lg border border-white/10 bg-slate-900/95 p-1.5 shadow-xl">
                {(Object.keys(STATUS_LABELS) as PresenceStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      updatePresence({ status: s });
                      setStatusPickerOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white hover:bg-slate-800"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow hover:bg-violet-500"
          >
            <Palette className="h-4 w-4" />
            Ubah Karakter
          </button>
        </div>
      </div>

      {editing && (
        <CharacterEditor initial={savedLook} onPreview={setLook} onSaved={handleSaved} onClose={() => setEditing(false)} />
      )}

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl" style={{ aspectRatio: "16 / 10" }}>
        <Canvas style={{ width: "100%", height: "100%", display: "block" }} dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 45, near: 1, far: 4000 }}>
          <color attach="background" args={["#0b1120"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[300, 500, 300]} intensity={0.9} color="#fff7e6" />
          <directionalLight position={[-300, 300, -200]} intensity={0.3} color="#bfdbfe" />
          <hemisphereLight args={["#cbd5e1", "#14532d", 0.35]} />

          <HouseScene ownerDoorOpen={isOwner} />

          <PlayerAvatar
            posRef={posRef}
            dirRef={dirRef}
            look={look}
            label={`${firstName(currentUser.fullName)} (Kamu)`}
            emote={myEmote}
            status={myStatus}
          />

          {othersInOffice.map((id) => {
            const entry = rosterById.get(id);
            if (!entry) return null;
            return (
              <RemoteAvatar
                key={id}
                id={id}
                remoteRef={remoteRef}
                remoteEmoteRef={remoteEmoteRef}
                look={lookFor(entry)}
                label={firstName(entry.fullName)}
                status={presenceMeta.get(id)?.status}
              />
            );
          })}

          {othersElsewhere.map((id) => {
            const entry = rosterById.get(id);
            if (!entry) return null;
            const desk = deskForDivision(entry.division);
            return (
              <DeskAvatar
                key={id}
                x={desk.x}
                y={desk.y}
                look={lookFor(entry)}
                label={firstName(entry.fullName)}
                status={presenceMeta.get(id)?.status}
              />
            );
          })}

          {sleepers.map((entry, i) => {
            const slot = sleepSlot(i);
            if (!slot) return null;
            return <SleeperAvatar key={entry.id} x={slot.x} y={slot.y} level={slot.level} look={entry.look} label={firstName(entry.fullName)} />;
          })}

          {AGENT_NPC_POSITIONS.map((npc) => {
            const agent = getAgentById(npc.agentId);
            return agent ? <AgentNPC key={npc.agentId} agent={agent} x={npc.x} y={npc.y} /> : null;
          })}

          <GameLoop
            keysRef={keysRef}
            posRef={posRef}
            dirRef={dirRef}
            broadcastMove={broadcastMove}
            remoteRef={remoteRef}
            blockers={blockers}
            rosterById={rosterById}
            setRoomId={setRoomId}
            setNearby={setNearby}
            setNearbyAgent={setNearbyAgent}
            setNearOwnerDoor={setNearOwnerDoor}
          />
        </Canvas>

        <div className="absolute left-3 bottom-3 flex flex-col items-start gap-2">
          {emotePickerOpen && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/95 p-2.5 shadow-xl">
              <div className="flex gap-1.5">
                {QUICK_EMOTES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => sendEmote(e)}
                    className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-lg transition-colors hover:bg-slate-700"
                  >
                    {e}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  sendEmote(emoteDraft);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  value={emoteDraft}
                  onChange={(ev) => setEmoteDraft(ev.target.value.slice(0, 40))}
                  placeholder="Tulis sesuatu..."
                  maxLength={40}
                  className="w-36 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="submit"
                  aria-label="Kirim"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}
          <button
            type="button"
            onClick={() => setEmotePickerOpen((v) => !v)}
            aria-label="Emote"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-800/90 text-white/80 shadow-lg transition-colors hover:bg-slate-700"
          >
            <Smile className="h-5 w-5" />
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-wrap justify-center gap-2 px-3">
          {nearbyAgent && (
            <Link
              href={`/dashboard/ai-assistant?agent=${nearbyAgent.id}`}
              className={cn(
                "pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-5 py-2.5 text-sm font-bold text-white shadow-lg",
                nearbyAgent.color
              )}
            >
              <Zap className="h-4 w-4" />
              Bicara dengan {nearbyAgent.name}
            </Link>
          )}
          {chatTarget && nearby && (
            <Link
              href={`/dashboard/chat?room=${chatTarget.room}${chatTarget.mention ? `&mention=${encodeURIComponent(chatTarget.mention)}` : ""}`}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg"
            >
              <MessageSquare className="h-4 w-4" />
              Chat dengan {firstName(nearby.fullName)}
            </Link>
          )}
          {canKnock && (
            <Link
              href={`/dashboard/chat?room=bersama&mention=${encodeURIComponent(ownerEntry!.username!)}`}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg"
            >
              <DoorClosed className="h-4 w-4" />
              Ketuk Pintu Kamar Owner
            </Link>
          )}
          {nearOwnerDoor && !isOwner && !canKnock && (
            <span className="rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white">Kamar Owner terkunci</span>
          )}
        </div>

        <div className="absolute right-3 top-3 hidden rounded-lg bg-black/50 px-3 py-1.5 text-[11px] text-white/70 sm:block">
          WASD / panah untuk berjalan (tahan Shift untuk lari) · dekati rekan atau NPC untuk interaksi
        </div>

        <Minimap posRef={posRef} remoteRef={remoteRef} othersInOffice={othersInOffice} />

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{toast}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 sm:hidden">
        <DpadButton label="Kiri" icon={ChevronLeft} onPress={(d) => pressVirtual("arrowleft", d)} />
        <div className="flex flex-col gap-2">
          <DpadButton label="Atas" icon={ChevronUp} onPress={(d) => pressVirtual("arrowup", d)} />
          <DpadButton label="Bawah" icon={ChevronDown} onPress={(d) => pressVirtual("arrowdown", d)} />
        </div>
        <DpadButton label="Kanan" icon={ChevronRight} onPress={(d) => pressVirtual("arrowright", d)} />
        <DpadButton label="Lari" icon={Rabbit} onPress={(d) => pressVirtual("shift", d)} />
      </div>
    </div>
  );
}

/** Minimap ringan: cuma kotak ruangan dari ROOMS (data, bukan render 3D)
 * + titik posisi sendiri & rekan yang sedang di Kantor Virtual. Update
 * posisi lewat interval singkat (bukan re-render React tiap frame) --
 * cukup utk kebutuhan "jangan nyasar", tidak perlu presisi 60fps. */
const MINIMAP_W = 92;
const MINIMAP_H = 108;

function Minimap({
  posRef,
  remoteRef,
  othersInOffice,
}: {
  posRef: { current: Pos };
  remoteRef: { current: Map<string, RemotePos> };
  othersInOffice: string[];
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);

  const upstairs = isUpstairs(posRef.current);
  const bounds = upstairs ? FLOOR2_BOUNDS : GROUND_BOUNDS;
  const scaleX = MINIMAP_W / bounds.w;
  const scaleY = MINIMAP_H / bounds.h;
  const rooms = ROOMS.filter((r) => (r.rect.x >= FLOOR2_OFFSET_X) === upstairs);

  return (
    <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/60 p-1.5 shadow-lg">
      <svg width={MINIMAP_W} height={MINIMAP_H} viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}>
        {rooms.map((r) => (
          <rect
            key={r.id}
            x={(r.rect.x - bounds.x) * scaleX}
            y={(r.rect.y - bounds.y) * scaleY}
            width={r.rect.w * scaleX}
            height={r.rect.h * scaleY}
            fill="#1e293b"
            stroke="#475569"
            strokeWidth={0.5}
          />
        ))}
        {othersInOffice.map((id) => {
          const rp = remoteRef.current.get(id);
          if (!rp || (rp.x >= FLOOR2_OFFSET_X) !== upstairs) return null;
          return <circle key={id} cx={(rp.x - bounds.x) * scaleX} cy={(rp.y - bounds.y) * scaleY} r={2} fill="#34d399" />;
        })}
        <circle
          cx={(posRef.current.x - bounds.x) * scaleX}
          cy={(posRef.current.y - bounds.y) * scaleY}
          r={2.6}
          fill="#a78bfa"
          stroke="#ffffff"
          strokeWidth={0.6}
        />
      </svg>
      <div className="mt-0.5 text-center text-[9px] font-semibold text-white/60">
        {upstairs ? "Lt. 2 · Gudang" : "Lantai 1"}
      </div>
    </div>
  );
}

function DpadButton({ icon: Icon, label, onPress }: { icon: typeof ChevronUp; label: string; onPress: (down: boolean) => void }) {
  // Pointer capture: begitu jari turun, SEMUA event pointer berikutnya (up/move)
  // tetap terkunci ke tombol ini walau jari sedikit geser keluar area tombol --
  // tanpa ini, jari yang geser cepat antar tombol D-pad bisa membuat arah
  // "nyangkut" ON (pointerleave tidak selalu konsisten saat gestur cepat) atau
  // malah memicu gestur bawaan browser (pilih teks/callout) di elemen lain.
  const handleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onPress(true);
  };
  const handleUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onPress(false);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={() => onPress(false)}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      className="grid h-14 w-14 touch-none select-none place-items-center rounded-xl border border-white/10 bg-slate-800 text-white/70 shadow-lg transition-all [-webkit-touch-callout:none] active:scale-95 active:bg-slate-700"
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

function GameLoop({
  keysRef,
  posRef,
  dirRef,
  broadcastMove,
  remoteRef,
  blockers,
  rosterById,
  setRoomId,
  setNearby,
  setNearbyAgent,
  setNearOwnerDoor,
}: {
  keysRef: { current: Set<string> };
  posRef: { current: Pos };
  dirRef: { current: Dir };
  broadcastMove: (x: number, y: number, dir: Dir) => void;
  remoteRef: { current: Map<string, RemotePos> };
  blockers: ReturnType<typeof blockersFor>;
  rosterById: Map<string, OfficeRosterEntry>;
  setRoomId: (id: RoomId | undefined) => void;
  setNearby: (entry: OfficeRosterEntry | null) => void;
  setNearbyAgent: (agent: AIAgent | null) => void;
  setNearOwnerDoor: (near: boolean) => void;
}) {
  const cameraReadyRef = useRef(false);
  const lastBroadcastRef = useRef(0);
  const lastRoomRef = useRef<RoomId | undefined | null>(null);
  const lastNearbyRef = useRef<string | null>(null);
  const lastAgentRef = useRef<string | null>(null);
  const lastDoorRef = useRef(false);
  const camTargetRef = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;
    let vx = 0;
    let vy = 0;
    if (keys.has("arrowup") || keys.has("w")) vy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) vy += 1;
    if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
    if (keys.has("arrowright") || keys.has("d")) vx += 1;

    let teleported = false;
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      const speed = keys.has("shift") ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED;
      posRef.current = resolveMove(posRef.current, (vx / len) * speed * dt, (vy / len) * speed * dt, blockers);
      dirRef.current = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      const next = stairsTeleport(posRef.current);
      if (next) {
        posRef.current = next;
        teleported = true;
      }
    }

    const now = performance.now();
    if (teleported || now - lastBroadcastRef.current > BROADCAST_INTERVAL_MS) {
      lastBroadcastRef.current = now;
      broadcastMove(posRef.current.x, posRef.current.y, dirRef.current);
    }

    const { x, y } = posRef.current;
    const roomId = getRoomAt(x, y)?.id;
    if (roomId !== lastRoomRef.current) {
      lastRoomRef.current = roomId;
      setRoomId(roomId);
    }

    let closestId: string | null = null;
    let closestDist = INTERACTION_RADIUS;
    for (const [id, rp] of remoteRef.current.entries()) {
      const d = Math.hypot(rp.x - x, rp.y - y);
      if (d < closestDist) {
        closestDist = d;
        closestId = id;
      }
    }
    if (closestId !== lastNearbyRef.current) {
      lastNearbyRef.current = closestId;
      setNearby(closestId ? rosterById.get(closestId) ?? null : null);
    }

    let agentId: string | null = null;
    let agentDist = INTERACTION_RADIUS;
    for (const npc of AGENT_NPC_POSITIONS) {
      const d = Math.hypot(npc.x - x, npc.y - y);
      if (d < agentDist) {
        agentDist = d;
        agentId = npc.agentId;
      }
    }
    if (agentId !== lastAgentRef.current) {
      lastAgentRef.current = agentId;
      setNearbyAgent(agentId ? getAgentById(agentId) ?? null : null);
    }

    const nearDoor = Math.hypot(OWNER_DOOR_CENTER.x - x, OWNER_DOOR_CENTER.y - y) < 50;
    if (nearDoor !== lastDoorRef.current) {
      lastDoorRef.current = nearDoor;
      setNearOwnerDoor(nearDoor);
    }

    const [sx, sy, sz] = toScene(x, y);
    camTargetRef.current.set(sx + CAMERA_OFFSET.x, sy + CAMERA_OFFSET.y, sz + CAMERA_OFFSET.z);
    if (!cameraReadyRef.current || teleported) {
      state.camera.position.copy(camTargetRef.current);
      cameraReadyRef.current = true;
    } else {
      state.camera.position.lerp(camTargetRef.current, 0.08);
    }
    state.camera.lookAt(sx, sy + 20, sz);
  });

  return null;
}
