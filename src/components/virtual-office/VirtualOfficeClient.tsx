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
  Users,
  Zap,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import type { ChatRoom } from "@/lib/chat/rooms";
import { CHAT_ROOM_LABELS } from "@/lib/chat/rooms";
import type { Division } from "@/lib/supabase/types";
import type { OfficeRosterEntry } from "@/lib/virtual-office/data";
import { sanitizeLook, type AvatarLook } from "@/lib/virtual-office/avatar-look";
import {
  AGENT_NPC_POSITIONS,
  OWNER_DOOR_CENTER,
  OWNER_ROOM_USER_IDS,
  PLAYER_SPEED,
  SPAWN,
  blockersFor,
  canEnterOwnerRoom,
  chatRoomFor,
  getRoom,
  getRoomAt,
  resolveMove,
  sleepSlot,
  stairsTeleport,
  type Pos,
  type RoomId,
} from "@/lib/virtual-office/house";
import { getAgentById, type AIAgent } from "@/lib/ai/agents";
import { HouseScene, toScene } from "./HouseScene";
import { AgentNPC, PlayerAvatar, RemoteAvatar, SleeperAvatar, type Dir, type RemotePos } from "./Avatars";
import { CharacterEditor } from "./CharacterEditor";

/**
 * Kantor Virtual v4 -- "Rumah Magna" (denah & aturan di
 * src/lib/virtual-office/house.ts). Rekan yang sedang membuka aplikasi
 * tampil online dan berjalan di rumah; yang tidak membuka aplikasi tidur di
 * kasurnya di Kamar Staff. Tiap orang bisa mengubah karakternya sendiri.
 */

const CHANNEL_NAME = "kantor-virtual";
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

type PresenceMeta = { onlineAt?: string; look?: unknown };

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

  const posRef = useRef<Pos>({ ...SPAWN });
  const dirRef = useRef<Dir>("up");
  const keysRef = useRef<Set<string>>(new Set());
  const remoteRef = useRef<Map<string, RemotePos>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lookRef = useRef<AvatarLook>(currentUser.look);

  const [look, setLook] = useState<AvatarLook>(currentUser.look);
  const [savedLook, setSavedLook] = useState<AvatarLook>(currentUser.look);
  const [editing, setEditing] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [presenceLooks, setPresenceLooks] = useState<Map<string, AvatarLook>>(new Map());
  const [roomId, setRoomId] = useState<RoomId | undefined>(undefined);
  const [nearby, setNearby] = useState<OfficeRosterEntry | null>(null);
  const [nearbyAgent, setNearbyAgent] = useState<AIAgent | null>(null);
  const [nearOwnerDoor, setNearOwnerDoor] = useState(false);

  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  // Realtime: posisi lewat broadcast, siapa online + tampilannya lewat presence.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(CHANNEL_NAME, {
      config: { broadcast: { self: false }, presence: { key: currentUser.id } },
    });

    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      const p = payload as { id: string; x: number; y: number; dir: Dir };
      if (p.id === currentUser.id || !rosterById.has(p.id)) return;
      remoteRef.current.set(p.id, { x: p.x, y: p.y, dir: p.dir });
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      // Kunci presence dipilih klien sendiri: hanya id yang ada di roster.
      const ids = Object.keys(state).filter((id) => rosterById.has(id));
      const looks = new Map<string, AvatarLook>();
      for (const id of ids) {
        const meta = state[id]?.[state[id].length - 1];
        if (meta?.look) looks.set(id, sanitizeLook(meta.look, id));
      }
      setOnlineIds(ids);
      setPresenceLooks(looks);
      for (const id of Array.from(remoteRef.current.keys())) {
        if (!ids.includes(id)) remoteRef.current.delete(id);
      }
    });

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      channel.track({ onlineAt: new Date().toISOString(), look: lookRef.current });
      channel.send({
        type: "broadcast",
        event: "move",
        payload: { id: currentUser.id, x: posRef.current.x, y: posRef.current.y, dir: dirRef.current },
      });
    });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUser.id, rosterById]);

  // Keyboard (diabaikan saat mengetik di input).
  useEffect(() => {
    const MOVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const k = e.key.toLowerCase();
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

  const handleSaved = useCallback((next: AvatarLook) => {
    setLook(next);
    setSavedLook(next);
    setEditing(false);
    channelRef.current?.track({ onlineAt: new Date().toISOString(), look: next });
  }, []);

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);
  const sleepers = useMemo(
    () =>
      roster
        .filter((r) => r.id !== currentUser.id && !onlineSet.has(r.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
    [roster, onlineSet, currentUser.id]
  );
  const others = onlineIds.filter((id) => id !== currentUser.id);
  const lookFor = (entry: OfficeRosterEntry) => presenceLooks.get(entry.id) ?? entry.look;

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
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow hover:bg-violet-500"
        >
          <Palette className="h-4 w-4" />
          Ubah Karakter
        </button>
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

          <PlayerAvatar posRef={posRef} dirRef={dirRef} look={look} label={`${firstName(currentUser.fullName)} (Kamu)`} />

          {others.map((id) => {
            const entry = rosterById.get(id);
            if (!entry) return null;
            return <RemoteAvatar key={id} id={id} remoteRef={remoteRef} look={lookFor(entry)} label={firstName(entry.fullName)} />;
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
            channelRef={channelRef}
            remoteRef={remoteRef}
            blockers={blockers}
            currentUserId={currentUser.id}
            rosterById={rosterById}
            setRoomId={setRoomId}
            setNearby={setNearby}
            setNearbyAgent={setNearbyAgent}
            setNearOwnerDoor={setNearOwnerDoor}
          />
        </Canvas>

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
          WASD / panah untuk berjalan · dekati rekan atau NPC untuk interaksi
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 sm:hidden">
        <DpadButton label="Kiri" icon={ChevronLeft} onPress={(d) => pressVirtual("arrowleft", d)} />
        <div className="flex flex-col gap-2">
          <DpadButton label="Atas" icon={ChevronUp} onPress={(d) => pressVirtual("arrowup", d)} />
          <DpadButton label="Bawah" icon={ChevronDown} onPress={(d) => pressVirtual("arrowdown", d)} />
        </div>
        <DpadButton label="Kanan" icon={ChevronRight} onPress={(d) => pressVirtual("arrowright", d)} />
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
  channelRef,
  remoteRef,
  blockers,
  currentUserId,
  rosterById,
  setRoomId,
  setNearby,
  setNearbyAgent,
  setNearOwnerDoor,
}: {
  keysRef: { current: Set<string> };
  posRef: { current: Pos };
  dirRef: { current: Dir };
  channelRef: { current: RealtimeChannel | null };
  remoteRef: { current: Map<string, RemotePos> };
  blockers: ReturnType<typeof blockersFor>;
  currentUserId: string;
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
      posRef.current = resolveMove(posRef.current, (vx / len) * PLAYER_SPEED * dt, (vy / len) * PLAYER_SPEED * dt, blockers);
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
      channelRef.current?.send({
        type: "broadcast",
        event: "move",
        payload: { id: currentUserId, x: posRef.current.x, y: posRef.current.y, dir: dirRef.current },
      });
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
