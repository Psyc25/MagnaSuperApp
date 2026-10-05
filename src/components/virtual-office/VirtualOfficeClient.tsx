"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MapPin, MessageSquare, Users } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Edges, Text } from "@react-three/drei";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";
import type { ChatRoom } from "@/lib/chat/rooms";
import type { Division } from "@/lib/supabase/types";
import type { OfficeRosterEntry } from "@/lib/virtual-office/data";
import type { OfficeRoom, Prop, Rect } from "@/lib/virtual-office/map";
import {
  AGENT_NPC_POSITIONS,
  DIVISION_COLORS,
  OBSTACLES,
  OUTDOOR_MARGIN,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROPS,
  ROOMS,
  SPAWN,
  WORLD_H,
  WORLD_W,
  getRoomAt,
  resolveMove,
} from "@/lib/virtual-office/map";
import { getAgentById, type AIAgent } from "@/lib/ai/agents";

/**
 * Tahap H+ -- "Kantor Virtual" versi 3D (permintaan Owner: "ubah bentuk
 * virtual gamenya ... di buat 3d ... pepohonan dan isi kantor"). Render
 * pakai React Three Fiber (WebGL sungguhan, bukan isometrik 2D) --
 * geometri dasar (box/cylinder/cone/sphere), BUKAN model 3D siap pakai,
 * supaya tidak menambah file asset.
 *
 * Logika non-visual (koneksi Realtime, kontrol keyboard, matematika
 * gerak/collision di map.ts) SENGAJA TIDAK diubah dari versi 2D --
 * hanya lapisan render yang diganti dari <canvas> 2D ke <Canvas> R3F.
 * Posisi avatar tiap frame diubah langsung lewat ref Three.js
 * (group.position.set), BUKAN lewat React state, supaya tidak ada
 * re-render React per frame gerakan (sama seperti filosofi versi 2D).
 *
 * Kamera "mengikuti dari belakang-atas" dengan offset TETAP (bukan
 * orbit bebas) supaya arah selalu bisa diprediksi pemain.
 */

type Dir = "up" | "down" | "left" | "right";
type RemotePos = { x: number; y: number; dir: Dir };
type Pos = { x: number; y: number };

const CHANNEL_NAME = "kantor-virtual";
const BROADCAST_INTERVAL_MS = 70;
const CHAT_PROXIMITY_PX = 72;
const CAMERA_OFFSET = { x: 0, y: 340, z: 300 };

const DIR_VECTORS: Record<Dir, { x: number; z: number }> = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

function dirToRadians(dir: Dir): number {
  const v = DIR_VECTORS[dir];
  return Math.atan2(v.x, v.z);
}

/** Konversi koordinat "peta 2D" (x,y piksel, y makin besar = makin ke
 * bawah) jadi koordinat scene 3D (X kanan, Y atas, Z depan) -- dipusatkan
 * di tengah dunia supaya kamera default (0,0,0) pas di tengah kantor. */
function toScene(x: number, y: number): [number, number, number] {
  return [x - WORLD_W / 2, 0, y - WORLD_H / 2];
}

/** "#RRGGBBAA" -> warna solid + opacity 0..1 (Three.js material tidak
 * baca alpha dari string hex 8-digit seperti canvas 2D). */
function hex8ToRgbAlpha(hex: string): { color: string; opacity: number } {
  if (hex.length === 9) {
    return { color: hex.slice(0, 7), opacity: parseInt(hex.slice(7, 9), 16) / 255 };
  }
  return { color: hex, opacity: 1 };
}

type CurrentUser = { id: string; fullName: string; username: string | null; division: Division };

/** Pilih ruang chat yang bisa dilihat KEDUA pihak -- investor SENGAJA
 * tidak pernah dapat tombol chat (fitur Chat tim ditutup total untuk
 * investor, lihat lib/chat/rooms.ts availableChatRooms -- tombol yang
 * membawa mereka ke halaman yang langsung redirect balik cuma bikin
 * bingung, bukan fitur). */
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

  const posRef = useRef<Pos>({ ...SPAWN });
  const dirRef = useRef<Dir>("down");
  const keysRef = useRef<Set<string>>(new Set());
  const remoteRef = useRef<Map<string, RemotePos>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef(0);
  const lastRoomLabelRef = useRef("");
  const lastNearbyIdRef = useRef<string | null>(null);
  const onlineIdsRef = useRef<string[]>([]);

  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [roomLabel, setRoomLabel] = useState("Koridor");
  const [nearby, setNearby] = useState<OfficeRosterEntry | null>(null);
  const [nearbyAgent, setNearbyAgent] = useState<AIAgent | null>(null);

  useEffect(() => {
    onlineIdsRef.current = onlineIds;
  }, [onlineIds]);

  // ---- Realtime: presence (siapa online) + broadcast (posisi jalan) ----
  // Satu channel dipakai bersama SELURUH pengguna yang buka halaman ini --
  // "key" presence = id pengguna, jadi kalau dia buka 2 tab tetap kehitung
  // satu orang (bukan dobel avatar).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(CHANNEL_NAME, {
      config: { broadcast: { self: false }, presence: { key: currentUser.id } },
    });

    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      const p = payload as { id: string; x: number; y: number; dir: Dir };
      if (p.id === currentUser.id) return;
      remoteRef.current.set(p.id, { x: p.x, y: p.y, dir: p.dir });
    });

    channel.on("presence", { event: "sync" }, () => {
      const ids = Object.keys(channel.presenceState());
      setOnlineIds(ids);
      for (const id of Array.from(remoteRef.current.keys())) {
        if (!ids.includes(id)) remoteRef.current.delete(id);
      }
    });

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      channel.track({ onlineAt: new Date().toISOString() });
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
  }, [currentUser.id]);

  // ---- Kontrol keyboard (WASD / tombol panah) ----
  useEffect(() => {
    const MOVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS.has(k)) return;
      keysRef.current.add(k);
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.key.toLowerCase());
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ---- Tombol arah sentuh (HP) -- pakai "kunci virtual" yang sama
  // dengan keyboard supaya logika gerak di game loop cukup satu jalur. ----
  const pressVirtual = useCallback((key: string, down: boolean) => {
    if (down) keysRef.current.add(key);
    else keysRef.current.delete(key);
  }, []);

  const chatTarget = nearby ? pickChatTarget(currentUser.division, nearby) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300",
            GLASS_SURFACE,
            GLASS_BORDER
          )}
        >
          <MapPin className="h-3.5 w-3.5 text-violet-500" />
          Kamu di: <span className="font-bold text-zinc-900 dark:text-white">{roomLabel}</span>
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300",
            GLASS_SURFACE,
            GLASS_BORDER
          )}
        >
          <Users className="h-3.5 w-3.5 text-emerald-500" />
          {onlineIds.length} orang online
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-zinc-200 shadow-sm dark:border-white/10"
        style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}
      >
        <Canvas
          style={{ width: "100%", height: "100%", display: "block" }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          camera={{ fov: 42, near: 1, far: 3000 }}
        >
          <color attach="background" args={["#dbeafe"]} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[250, 400, 150]} intensity={1} />
          <hemisphereLight args={["#bae6fd", "#3f6212", 0.4]} />

          <GardenGround />
          <BuildingFloor />
          {ROOMS.map((room) => (
            <RoomFloor key={room.id} room={room} />
          ))}
          {OBSTACLES.map((rect, i) => (
            <Desk key={i} rect={rect} />
          ))}
          {PROPS.map((prop) => (
            <PropMesh key={prop.id} prop={prop} />
          ))}

          <SelfAvatar posRef={posRef} dirRef={dirRef} currentUser={currentUser} />
          {onlineIds
            .filter((id) => id !== currentUser.id)
            .map((id) => {
              const entry = rosterById.get(id);
              if (!entry) return null;
              return <RemoteAvatar key={id} id={id} remoteRef={remoteRef} entry={entry} />;
            })}

          {/* AI Agent NPCs */}
          {AGENT_NPC_POSITIONS.map((npcPos) => {
            const agent = getAgentById(npcPos.agentId);
            if (!agent) return null;
            return (
              <AgentNPC
                key={npcPos.agentId}
                agent={agent}
                x={npcPos.x}
                y={npcPos.y}
                onClick={() => setNearbyAgent(agent)}
              />
            );
          })}

          <GameLoop
            keysRef={keysRef}
            posRef={posRef}
            dirRef={dirRef}
            channelRef={channelRef}
            lastBroadcastRef={lastBroadcastRef}
            lastRoomLabelRef={lastRoomLabelRef}
            lastNearbyIdRef={lastNearbyIdRef}
            remoteRef={remoteRef}
            currentUser={currentUser}
            rosterById={rosterById}
            setRoomLabel={setRoomLabel}
            setNearby={setNearby}
          />
        </Canvas>

        {chatTarget && nearby && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <Link
              href={`/dashboard/chat?room=${chatTarget.room}${
                chatTarget.mention ? `&mention=${encodeURIComponent(chatTarget.mention)}` : ""
              }`}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105 dark:bg-white dark:text-zinc-900"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat dengan {nearby.fullName.split(" ")[0]}
            </Link>
          </div>
        )}

        {nearbyAgent && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Link
              href={`/dashboard/ai-assistant?agent=${nearbyAgent.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105",
                `bg-gradient-to-r ${nearbyAgent.color}`
              )}
            >
              <span>{nearbyAgent.icon}</span>
              Bicara dengan {nearbyAgent.name}
            </Link>
            <button
              onClick={() => setNearbyAgent(null)}
              className="grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 sm:hidden">
        <DpadButton icon={ChevronLeft} onPress={(d) => pressVirtual("arrowleft", d)} />
        <div className="flex flex-col gap-1.5">
          <DpadButton icon={ChevronUp} onPress={(d) => pressVirtual("arrowup", d)} />
          <DpadButton icon={ChevronDown} onPress={(d) => pressVirtual("arrowdown", d)} />
        </div>
        <DpadButton icon={ChevronRight} onPress={(d) => pressVirtual("arrowright", d)} />
      </div>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 sm:text-left">
        Gerak pakai tombol panah/WASD (atau tombol arah di atas kalau di HP) -- dekati rekan kerja buat lihat tombol
        &quot;Chat&quot;.
      </p>
    </div>
  );
}

function DpadButton({ icon: Icon, onPress }: { icon: typeof ChevronUp; onPress: (down: boolean) => void }) {
  return (
    <button
      type="button"
      onPointerDown={() => onPress(true)}
      onPointerUp={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
      className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 3D -- semua yang di bawah ini dirender DI DALAM <Canvas>.     */
/* ------------------------------------------------------------------ */

function GardenGround() {
  const [x, , z] = toScene(WORLD_W / 2, WORLD_H / 2);
  return (
    <mesh position={[x, -1, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[WORLD_W + OUTDOOR_MARGIN * 2, WORLD_H + OUTDOOR_MARGIN * 2]} />
      <meshStandardMaterial color="#65a30d" side={THREE.DoubleSide} />
    </mesh>
  );
}

function BuildingFloor() {
  const [x, , z] = toScene(WORLD_W / 2, WORLD_H / 2);
  return (
    <mesh position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[WORLD_W, WORLD_H]} />
      <meshStandardMaterial color="#e4e7eb" side={THREE.DoubleSide} />
    </mesh>
  );
}

function RoomFloor({ room }: { room: OfficeRoom }) {
  const [x, , z] = toScene(room.rect.x + room.rect.w / 2, room.rect.y + room.rect.h / 2);
  const { color, opacity } = hex8ToRgbAlpha(room.floorColor);
  return (
    <mesh position={[x, 0.5, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[room.rect.w, room.rect.h]} />
      <meshStandardMaterial color={color} transparent opacity={Math.max(opacity, 0.35)} side={THREE.DoubleSide} />
      <Edges color={room.accentColor} />
    </mesh>
  );
}

function Desk({ rect }: { rect: Rect }) {
  const [x, , z] = toScene(rect.x + rect.w / 2, rect.y + rect.h / 2);
  return (
    <mesh position={[x, 20, z]}>
      <boxGeometry args={[rect.w, 40, rect.h]} />
      <meshStandardMaterial color="#b45309" />
    </mesh>
  );
}

function PropMesh({ prop }: { prop: Prop }) {
  const [x, , z] = toScene(prop.x, prop.y);
  switch (prop.type) {
    case "tree":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 20, 0]}>
            <cylinderGeometry args={[4, 5, 40, 8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[0, 58, 0]}>
            <coneGeometry args={[28, 60, 8]} />
            <meshStandardMaterial color="#15803d" />
          </mesh>
        </group>
      );
    case "bush":
      return (
        <mesh position={[x, 10, z]}>
          <sphereGeometry args={[14, 8, 8]} />
          <meshStandardMaterial color="#16a34a" />
        </mesh>
      );
    case "chair":
    case "meetingChair":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 10, 0]}>
            <boxGeometry args={[16, 4, 16]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 20, -7]}>
            <boxGeometry args={[16, 20, 3]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      );

    case "computer":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 22, 0]}>
            <boxGeometry args={[16, 12, 2]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, 15, 4]}>
            <boxGeometry args={[10, 2, 8]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
      );
    case "fridge":
      return (
        <mesh position={[x, 30, z]}>
          <boxGeometry args={[26, 60, 24]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      );
    case "dispenser":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 20, 0]}>
            <cylinderGeometry args={[8, 10, 40, 12]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
          <mesh position={[0, 44, 0]}>
            <cylinderGeometry args={[7, 7, 8, 12]} />
            <meshStandardMaterial color="#0ea5e9" />
          </mesh>
        </group>
      );
    case "cabinet":
      return (
        <mesh position={[x, 35, z]}>
          <boxGeometry args={[40, 70, 24]} />
          <meshStandardMaterial color="#92400e" />
        </mesh>
      );

    // -- Dekorasi khas per ruangan (permintaan Owner setelah lihat
    // referensi video game RPG top-down: tiap ruangan lebih "niat" &
    // punya identitas beda-beda, tetap primitif geometri saja). --
    case "crate":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 10, 0]}>
            <boxGeometry args={[22, 20, 22]} />
            <meshStandardMaterial color="#a16207" />
          </mesh>
          <mesh position={[9, 28, 5]}>
            <boxGeometry args={[18, 16, 18]} />
            <meshStandardMaterial color="#ca8a04" />
          </mesh>
        </group>
      );
    case "rack":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 35, 0]}>
            <boxGeometry args={[40, 70, 16]} />
            <meshStandardMaterial color="#57534e" />
          </mesh>
          <mesh position={[-10, 20, 7]}>
            <boxGeometry args={[10, 10, 6]} />
            <meshStandardMaterial color="#0ea5e9" />
          </mesh>
          <mesh position={[8, 50, 7]}>
            <boxGeometry args={[12, 8, 6]} />
            <meshStandardMaterial color="#f59e0b" />
          </mesh>
        </group>
      );
    case "moodboard":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 40, 0]}>
            <boxGeometry args={[36, 26, 2]} />
            <meshStandardMaterial color="#fbcfe8" />
          </mesh>
          <mesh position={[-10, 44, 1.5]}>
            <boxGeometry args={[8, 6, 1]} />
            <meshStandardMaterial color="#f9a8d4" />
          </mesh>
          <mesh position={[10, 36, 1.5]}>
            <boxGeometry args={[8, 6, 1]} />
            <meshStandardMaterial color="#c026d3" />
          </mesh>
        </group>
      );
    case "ringlight":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[2, 2, 50, 8]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0, 55, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[14, 3, 8, 20]} />
            <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.4} />
          </mesh>
        </group>
      );
    case "ladder":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[-6, 25, 0]} rotation={[0, 0, 0.15]}>
            <boxGeometry args={[3, 50, 3]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[6, 25, 0]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[3, 50, 3]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[0, 16, 0]}>
            <boxGeometry args={[16, 3, 3]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 32, 0]}>
            <boxGeometry args={[13, 3, 3]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
        </group>
      );
    case "planks":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 6, 0]}>
            <boxGeometry args={[50, 6, 14]} />
            <meshStandardMaterial color="#b45309" />
          </mesh>
          <mesh position={[2, 14, 0]}>
            <boxGeometry args={[46, 6, 12]} />
            <meshStandardMaterial color="#a16207" />
          </mesh>
          <mesh position={[-2, 22, 0]}>
            <boxGeometry args={[44, 6, 12]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
        </group>
      );
    case "tv":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 45, 0]}>
            <boxGeometry args={[46, 28, 3]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, 45, 1.8]}>
            <boxGeometry args={[40, 22, 1]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 26, 0]}>
            <boxGeometry args={[6, 20, 6]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      );
    case "whiteboard":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 42, 0]}>
            <boxGeometry args={[50, 32, 2]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh position={[-20, 14, 0]}>
            <cylinderGeometry args={[1.5, 1.5, 28, 6]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          <mesh position={[20, 14, 0]}>
            <cylinderGeometry args={[1.5, 1.5, 28, 6]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        </group>
      );
    case "stool":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 22, 0]}>
            <cylinderGeometry args={[9, 9, 4, 12]} />
            <meshStandardMaterial color="#ea580c" />
          </mesh>
          <mesh position={[0, 10, 0]}>
            <cylinderGeometry args={[2, 2, 20, 8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
        </group>
      );
    case "microwave":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 15, 0]}>
            <boxGeometry args={[26, 18, 20]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0, 15, 10.5]}>
            <boxGeometry args={[18, 12, 1]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
      );
    case "bookshelf":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 45, 0]}>
            <boxGeometry args={[44, 90, 18]} />
            <meshStandardMaterial color="#7c2d12" />
          </mesh>
          <mesh position={[-10, 20, 10]}>
            <boxGeometry args={[5, 16, 3]} />
            <meshStandardMaterial color="#f59e0b" />
          </mesh>
          <mesh position={[-4, 45, 10]}>
            <boxGeometry args={[5, 16, 3]} />
            <meshStandardMaterial color="#0ea5e9" />
          </mesh>
          <mesh position={[2, 70, 10]}>
            <boxGeometry args={[5, 16, 3]} />
            <meshStandardMaterial color="#dc2626" />
          </mesh>
        </group>
      );
    case "sofa":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 12, 0]}>
            <boxGeometry args={[46, 16, 20]} />
            <meshStandardMaterial color="#6d28d9" />
          </mesh>
          <mesh position={[0, 26, -8]}>
            <boxGeometry args={[46, 22, 4]} />
            <meshStandardMaterial color="#6d28d9" />
          </mesh>
          <mesh position={[-21, 20, 0]}>
            <boxGeometry args={[4, 20, 20]} />
            <meshStandardMaterial color="#5b21b6" />
          </mesh>
          <mesh position={[21, 20, 0]}>
            <boxGeometry args={[4, 20, 20]} />
            <meshStandardMaterial color="#5b21b6" />
          </mesh>
        </group>
      );
    case "bench":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 18, 0]}>
            <boxGeometry args={[50, 4, 16]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 32, -7]}>
            <boxGeometry args={[50, 20, 3]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[-20, 9, 0]}>
            <boxGeometry args={[4, 18, 16]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
          <mesh position={[20, 9, 0]}>
            <boxGeometry args={[4, 18, 16]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
        </group>
      );
    case "lamppost":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 45, 0]}>
            <cylinderGeometry args={[2, 2.5, 90, 8]} />
            <meshStandardMaterial color="#27272a" />
          </mesh>
          <mesh position={[0, 92, 0]}>
            <sphereGeometry args={[9, 12, 12]} />
            <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={0.7} />
          </mesh>
        </group>
      );
    case "pottedplant":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 8, 0]}>
            <cylinderGeometry args={[9, 7, 16, 10]} />
            <meshStandardMaterial color="#b45309" />
          </mesh>
          <mesh position={[0, 24, 0]}>
            <sphereGeometry args={[13, 10, 10]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/** AI Agent NPC — robot-style avatar with glow effect and agent colors */
function AgentNPC({ agent, x, y, onClick }: { agent: AIAgent; x: number; y: number; onClick: () => void }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const [sx, , sz] = toScene(x, y);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    g.rotation.y += delta * 0.5;
  });

  const gradientColors: Record<string, string> = {
    nova: "#8b5cf6",
    reno: "#10b981",
    crea: "#ec4899",
    fabr: "#f59e0b",
    finn: "#0ea5e9",
  };
  const color = gradientColors[agent.id] ?? "#8b5cf6";

  return (
    <group
      position={[sx, 0, sz]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Base platform with glow */}
      <mesh position={[0, 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[18, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.8 : 0.4} transparent opacity={0.7} />
      </mesh>

      {/* Robot body */}
      <group ref={groupRef}>
        {/* Torso */}
        <mesh position={[0, 22, 0]}>
          <boxGeometry args={[20, 24, 14]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 42, 0]}>
          <boxGeometry args={[16, 14, 12]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.2} />
        </mesh>
        {/* Visor/Eyes */}
        <mesh position={[0, 43, 6.5]}>
          <boxGeometry args={[12, 5, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.2 : 0.6} />
        </mesh>
        {/* Antenna */}
        <mesh position={[0, 52, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 6, 8]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <mesh position={[0, 56, 0]}>
          <sphereGeometry args={[3, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.5 : 0.8} />
        </mesh>
      </group>

      {/* Agent name label */}
      <Billboard position={[0, 68, 0]}>
        <Text
          fontSize={11}
          color="#ffffff"
          outlineWidth={0.8}
          outlineColor={color}
          anchorX="center"
          anchorY="middle"
        >
          {agent.icon} {agent.name}
        </Text>
      </Billboard>
    </group>
  );
}

const AvatarMesh = forwardRef<THREE.Group, { color: string; label: string; isSelf: boolean }>(function AvatarMesh(
  { color, label, isSelf },
  ref
) {
  return (
    <group ref={ref}>
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[PLAYER_RADIUS - 3, PLAYER_RADIUS, 32, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 40, 0]}>
        <sphereGeometry args={[10, 16, 16]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>
      <mesh position={[0, 16, 13]}>
        <boxGeometry args={[6, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Billboard position={[0, 62, 0]}>
        <Text
          fontSize={11}
          color="#ffffff"
          outlineWidth={0.6}
          outlineColor={isSelf ? "#7c3aed" : "#0f172a"}
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
});

function SelfAvatar({
  posRef,
  dirRef,
  currentUser,
}: {
  posRef: { current: Pos };
  dirRef: { current: Dir };
  currentUser: CurrentUser;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const [x, y, z] = toScene(posRef.current.x, posRef.current.y);
    g.position.set(x, y, z);
    g.rotation.y = dirToRadians(dirRef.current);
  });
  return (
    <AvatarMesh
      ref={groupRef}
      color={DIVISION_COLORS[currentUser.division]}
      label={`${currentUser.fullName} (Kamu)`}
      isSelf
    />
  );
}

function RemoteAvatar({
  id,
  remoteRef,
  entry,
}: {
  id: string;
  remoteRef: { current: Map<string, RemotePos> };
  entry: OfficeRosterEntry;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const rp = remoteRef.current.get(id);
    const [x, y, z] = toScene(rp?.x ?? SPAWN.x, rp?.y ?? SPAWN.y);
    g.position.set(x, y, z);
    if (rp) g.rotation.y = dirToRadians(rp.dir);
  });
  return <AvatarMesh ref={groupRef} color={DIVISION_COLORS[entry.division]} label={entry.fullName} isSelf={false} />;
}

/** Komponen "tak kasat mata" (return null) yang isinya SATU-SATUNYA
 * `useFrame` untuk logika non-visual -- baca input keyboard, gerakkan
 * posRef lewat resolveMove, broadcast posisi (throttle), deteksi ruangan
 * & rekan terdekat (buat tombol Chat), dan gerakkan kamera "mengikuti"
 * avatar sendiri dengan offset tetap (BUKAN orbit bebas). Dipisah dari
 * SelfAvatar/RemoteAvatar supaya render posisi avatar tidak numpuk
 * dengan logika input/network di satu tempat. */
function GameLoop({
  keysRef,
  posRef,
  dirRef,
  channelRef,
  lastBroadcastRef,
  lastRoomLabelRef,
  lastNearbyIdRef,
  remoteRef,
  currentUser,
  rosterById,
  setRoomLabel,
  setNearby,
}: {
  keysRef: { current: Set<string> };
  posRef: { current: Pos };
  dirRef: { current: Dir };
  channelRef: { current: RealtimeChannel | null };
  lastBroadcastRef: { current: number };
  lastRoomLabelRef: { current: string };
  lastNearbyIdRef: { current: string | null };
  remoteRef: { current: Map<string, RemotePos> };
  currentUser: CurrentUser;
  rosterById: Map<string, OfficeRosterEntry>;
  setRoomLabel: (label: string) => void;
  setNearby: (entry: OfficeRosterEntry | null) => void;
}) {
  const { camera } = useThree();
  const cameraReadyRef = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;
    let vx = 0;
    let vy = 0;
    if (keys.has("arrowup") || keys.has("w")) vy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) vy += 1;
    if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
    if (keys.has("arrowright") || keys.has("d")) vx += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      const dx = (vx / len) * PLAYER_SPEED * dt;
      const dy = (vy / len) * PLAYER_SPEED * dt;
      posRef.current = resolveMove(posRef.current.x, posRef.current.y, dx, dy);
      dirRef.current = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
    }

    const now = performance.now();
    if (now - lastBroadcastRef.current > BROADCAST_INTERVAL_MS) {
      lastBroadcastRef.current = now;
      channelRef.current?.send({
        type: "broadcast",
        event: "move",
        payload: { id: currentUser.id, x: posRef.current.x, y: posRef.current.y, dir: dirRef.current },
      });
    }

    const room = getRoomAt(posRef.current.x, posRef.current.y);
    const label = room?.label ?? "Koridor";
    if (label !== lastRoomLabelRef.current) {
      lastRoomLabelRef.current = label;
      setRoomLabel(label);
    }

    let closestId: string | null = null;
    let closestDist = CHAT_PROXIMITY_PX;
    for (const [id, rp] of remoteRef.current.entries()) {
      const d = Math.hypot(rp.x - posRef.current.x, rp.y - posRef.current.y);
      if (d < closestDist) {
        closestDist = d;
        closestId = id;
      }
    }
    if (closestId !== lastNearbyIdRef.current) {
      lastNearbyIdRef.current = closestId;
      setNearby(closestId ? rosterById.get(closestId) ?? null : null);
    }

    const [sx, sy, sz] = toScene(posRef.current.x, posRef.current.y);
    const targetX = sx + CAMERA_OFFSET.x;
    const targetY = sy + CAMERA_OFFSET.y;
    const targetZ = sz + CAMERA_OFFSET.z;
    if (!cameraReadyRef.current) {
      camera.position.set(targetX, targetY, targetZ);
      cameraReadyRef.current = true;
    } else {
      camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.12);
    }
    camera.lookAt(sx, sy + 30, sz);
  });

  return null;
}
