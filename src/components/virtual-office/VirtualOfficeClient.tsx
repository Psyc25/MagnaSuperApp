"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  MessageSquare,
  Users,
  Zap
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
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
 * Virtual Office v3 - Game-Like Interactive Workspace
 *
 * Kombinasi terbaik:
 * - Walking mechanics (WASD/Arrow) seperti game
 * - Visual modern corporate dengan chibi avatars
 * - AI Agent NPCs yang bisa diajak bicara
 * - Real-time multiplayer presence
 */

type Dir = "up" | "down" | "left" | "right";
type RemotePos = { x: number; y: number; dir: Dir };
type Pos = { x: number; y: number };

const CHANNEL_NAME = "kantor-virtual";
const BROADCAST_INTERVAL_MS = 70;
const INTERACTION_RADIUS = 60;
const CAMERA_OFFSET = { x: 0, y: 280, z: 220 };

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

function toScene(x: number, y: number): [number, number, number] {
  return [x - WORLD_W / 2, 0, y - WORLD_H / 2];
}

function hex8ToRgbAlpha(hex: string): { color: string; opacity: number } {
  if (hex.length === 9) {
    return { color: hex.slice(0, 7), opacity: parseInt(hex.slice(7, 9), 16) / 255 };
  }
  return { color: hex, opacity: 1 };
}

type CurrentUser = { id: string; fullName: string; username: string | null; division: Division };

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

  // Player state
  const posRef = useRef<Pos>({ ...SPAWN });
  const dirRef = useRef<Dir>("down");
  const keysRef = useRef<Set<string>>(new Set());

  // Multiplayer state
  const remoteRef = useRef<Map<string, RemotePos>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef(0);

  // UI state
  const lastRoomLabelRef = useRef("");
  const lastNearbyIdRef = useRef<string | null>(null);
  const lastNearbyAgentRef = useRef<string | null>(null);
  const onlineIdsRef = useRef<string[]>([]);

  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [roomLabel, setRoomLabel] = useState("Lobby");
  const [nearby, setNearby] = useState<OfficeRosterEntry | null>(null);
  const [nearbyAgent, setNearbyAgent] = useState<AIAgent | null>(null);

  useEffect(() => {
    onlineIdsRef.current = onlineIds;
  }, [onlineIds]);

  // Realtime connection
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

  // Keyboard controls
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

  // Virtual D-pad for mobile
  const pressVirtual = useCallback((key: string, down: boolean) => {
    if (down) keysRef.current.add(key);
    else keysRef.current.delete(key);
  }, []);

  const chatTarget = nearby ? pickChatTarget(currentUser.division, nearby) : null;

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-800/80 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm font-medium text-white">
            <MapPin className="h-4 w-4 text-violet-400" />
            <span className="text-white/60">Lokasi:</span>
            <span className="font-bold">{roomLabel}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-800/80 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm font-medium text-white">
            <Users className="h-4 w-4 text-emerald-400" />
            <span className="font-bold text-emerald-400">{onlineIds.length}</span>
            <span className="text-white/60">online</span>
          </span>
        </div>
        <div className="text-xs text-white/40 hidden sm:block">
          Gunakan WASD atau Arrow Keys untuk bergerak
        </div>
      </div>

      {/* Game Canvas */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
        style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}
      >
        <Canvas
          style={{ width: "100%", height: "100%", display: "block" }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          camera={{ fov: 45, near: 1, far: 3000 }}
        >
          {/* Sky */}
          <color attach="background" args={["#0f172a"]} />

          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight position={[300, 400, 200]} intensity={0.8} color="#fef3c7" />
          <directionalLight position={[-200, 300, -100]} intensity={0.3} color="#bfdbfe" />
          <hemisphereLight args={["#1e3a5f", "#064e3b", 0.3]} />
          <pointLight position={[0, 100, 0]} intensity={0.5} color="#8b5cf6" distance={500} />

          {/* Environment */}
          <Ground />
          <BuildingFloor />
          {ROOMS.map((room) => (
            <RoomFloor key={room.id} room={room} />
          ))}
          {OBSTACLES.map((rect, i) => (
            <ModernDesk key={i} rect={rect} />
          ))}
          {PROPS.map((prop) => (
            <PropMesh key={prop.id} prop={prop} />
          ))}

          {/* Player Avatar */}
          <PlayerAvatar posRef={posRef} dirRef={dirRef} currentUser={currentUser} />

          {/* Other Players */}
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
              />
            );
          })}

          {/* Game Loop */}
          <GameLoop
            keysRef={keysRef}
            posRef={posRef}
            dirRef={dirRef}
            channelRef={channelRef}
            lastBroadcastRef={lastBroadcastRef}
            lastRoomLabelRef={lastRoomLabelRef}
            lastNearbyIdRef={lastNearbyIdRef}
            lastNearbyAgentRef={lastNearbyAgentRef}
            remoteRef={remoteRef}
            currentUser={currentUser}
            rosterById={rosterById}
            setRoomLabel={setRoomLabel}
            setNearby={setNearby}
            setNearbyAgent={setNearbyAgent}
          />
        </Canvas>

        {/* Interaction Prompts */}
        {chatTarget && nearby && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce-subtle">
            <Link
              href={`/dashboard/chat?room=${chatTarget.room}${
                chatTarget.mention ? `&mention=${encodeURIComponent(chatTarget.mention)}` : ""
              }`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition-transform hover:scale-105"
            >
              <MessageSquare className="h-4 w-4" />
              Chat dengan {nearby.fullName.split(" ")[0]}
            </Link>
          </div>
        )}

        {nearbyAgent && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce-subtle">
            <Link
              href={`/dashboard/ai-assistant?agent=${nearbyAgent.id}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105",
                `bg-gradient-to-r ${nearbyAgent.color}`
              )}
            >
              <Zap className="h-4 w-4" />
              Bicara dengan {nearbyAgent.name}
            </Link>
          </div>
        )}

        {/* Mini Instructions */}
        <div className="absolute top-3 right-3 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 text-[10px] text-white/60">
          Dekati karakter untuk interaksi
        </div>
      </div>

      {/* Mobile D-Pad */}
      <div className="flex items-center justify-center gap-2 sm:hidden">
        <DpadButton icon={ChevronLeft} onPress={(d) => pressVirtual("arrowleft", d)} />
        <div className="flex flex-col gap-2">
          <DpadButton icon={ChevronUp} onPress={(d) => pressVirtual("arrowup", d)} />
          <DpadButton icon={ChevronDown} onPress={(d) => pressVirtual("arrowdown", d)} />
        </div>
        <DpadButton icon={ChevronRight} onPress={(d) => pressVirtual("arrowright", d)} />
      </div>
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
      className="grid h-14 w-14 place-items-center rounded-xl bg-slate-800 border border-white/10 text-white/70 shadow-lg active:bg-slate-700 active:scale-95 transition-all"
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 3D Scene Components                                                 */
/* ------------------------------------------------------------------ */

function Ground() {
  const [x, , z] = toScene(WORLD_W / 2, WORLD_H / 2);
  return (
    <group>
      {/* Outer grass */}
      <mesh position={[x, -2, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WORLD_W + OUTDOOR_MARGIN * 2, WORLD_H + OUTDOOR_MARGIN * 2]} />
        <meshStandardMaterial color="#064e3b" />
      </mesh>
      {/* Pavement around building */}
      <mesh position={[x, -1, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WORLD_W + 60, WORLD_H + 60]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
}

function BuildingFloor() {
  const [x, , z] = toScene(WORLD_W / 2, WORLD_H / 2);
  return (
    <group>
      <mesh position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WORLD_W, WORLD_H]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Corridor highlights */}
      <mesh position={[x, 0.5, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, WORLD_H]} />
        <meshStandardMaterial color="#334155" emissive="#334155" emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[x, 0.5, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WORLD_W, 50]} />
        <meshStandardMaterial color="#334155" emissive="#334155" emissiveIntensity={0.1} />
      </mesh>
    </group>
  );
}

function RoomFloor({ room }: { room: OfficeRoom }) {
  const [x, , z] = toScene(room.rect.x + room.rect.w / 2, room.rect.y + room.rect.h / 2);
  const { color, opacity } = hex8ToRgbAlpha(room.floorColor);

  return (
    <group>
      {/* Room floor */}
      <mesh position={[x, 1, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[room.rect.w - 10, room.rect.h - 10]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={Math.max(opacity, 0.4)}
          emissive={room.accentColor}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Glass walls */}
      <mesh position={[x - room.rect.w / 2 + 3, 25, z]}>
        <boxGeometry args={[4, 50, room.rect.h - 10]} />
        <meshStandardMaterial color={room.accentColor} transparent opacity={0.15} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[x, 25, z - room.rect.h / 2 + 3]}>
        <boxGeometry args={[room.rect.w - 10, 50, 4]} />
        <meshStandardMaterial color={room.accentColor} transparent opacity={0.15} metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Room label */}
      <Text
        position={[x, 3, z + room.rect.h / 2 - 20]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={14}
        color={room.accentColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.5}
        outlineColor="#000"
      >
        {room.label}
      </Text>
    </group>
  );
}

function ModernDesk({ rect }: { rect: Rect }) {
  const [x, , z] = toScene(rect.x + rect.w / 2, rect.y + rect.h / 2);
  return (
    <group>
      {/* Desk surface */}
      <mesh position={[x, 28, z]}>
        <boxGeometry args={[rect.w, 4, rect.h]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.1} roughness={0.3} />
      </mesh>
      {/* Desk legs */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([lx, lz], i) => (
        <mesh key={i} position={[x + lx * (rect.w / 2 - 5), 14, z + lz * (rect.h / 2 - 5)]}>
          <boxGeometry args={[4, 28, 4]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[x, 42, z]}>
        <boxGeometry args={[rect.w * 0.4, 20, 3]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[x, 42, z + 2]}>
        <boxGeometry args={[rect.w * 0.38, 18, 1]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function PropMesh({ prop }: { prop: Prop }) {
  const [x, , z] = toScene(prop.x, prop.y);

  switch (prop.type) {
    case "tree":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[5, 6, 50, 8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh position={[0, 65, 0]}>
            <coneGeometry args={[30, 70, 8]} />
            <meshStandardMaterial color="#166534" />
          </mesh>
        </group>
      );
    case "bush":
      return (
        <mesh position={[x, 12, z]}>
          <sphereGeometry args={[16, 8, 8]} />
          <meshStandardMaterial color="#15803d" />
        </mesh>
      );
    case "chair":
    case "meetingChair":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 12, 0]}>
            <boxGeometry args={[18, 5, 18]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
          <mesh position={[0, 24, -8]}>
            <boxGeometry args={[18, 22, 4]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </group>
      );
    case "computer":
      return (
        <group position={[x, 30, z]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[18, 14, 2]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, 0, 1.5]}>
            <boxGeometry args={[16, 12, 1]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.4} />
          </mesh>
        </group>
      );
    case "fridge":
      return (
        <mesh position={[x, 35, z]}>
          <boxGeometry args={[30, 70, 28]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.3} />
        </mesh>
      );
    case "dispenser":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[10, 12, 50, 12]} />
            <meshStandardMaterial color="#0ea5e9" />
          </mesh>
          <mesh position={[0, 54, 0]}>
            <cylinderGeometry args={[8, 8, 10, 12]} />
            <meshStandardMaterial color="#0284c7" />
          </mesh>
        </group>
      );
    case "sofa":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 14, 0]}>
            <boxGeometry args={[50, 18, 24]} />
            <meshStandardMaterial color="#7c3aed" />
          </mesh>
          <mesh position={[0, 30, -10]}>
            <boxGeometry args={[50, 26, 5]} />
            <meshStandardMaterial color="#6d28d9" />
          </mesh>
        </group>
      );
    case "pottedplant":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 10, 0]}>
            <cylinderGeometry args={[10, 8, 20, 10]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
          <mesh position={[0, 30, 0]}>
            <sphereGeometry args={[16, 10, 10]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>
      );
    case "lamppost":
      return (
        <group position={[x, 0, z]}>
          <mesh position={[0, 50, 0]}>
            <cylinderGeometry args={[3, 3, 100, 8]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
          <mesh position={[0, 105, 0]}>
            <sphereGeometry args={[12, 12, 12]} />
            <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={0.8} />
          </mesh>
          <pointLight position={[x, 100, z]} intensity={0.5} color="#fef08a" distance={150} />
        </group>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Avatar Components                                                   */
/* ------------------------------------------------------------------ */

const ChibiAvatar = forwardRef<THREE.Group, { color: string; label: string; isSelf: boolean; isOnline?: boolean }>(
  function ChibiAvatar({ color, label, isSelf, isOnline = true }, ref) {
    return (
      <group ref={ref}>
        {/* Shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
          <circleGeometry args={[12, 16]} />
          <meshStandardMaterial color="#000" transparent opacity={0.3} />
        </mesh>

        {/* Body */}
        <mesh position={[0, 14, 0]}>
          <capsuleGeometry args={[8, 12, 8, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>

        {/* Arms */}
        <mesh position={[-12, 16, 0]}>
          <capsuleGeometry args={[4, 8, 4, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[12, 16, 0]}>
          <capsuleGeometry args={[4, 8, 4, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 38, 0]}>
          <sphereGeometry args={[14, 20, 20]} />
          <meshStandardMaterial color="#fef3c7" />
        </mesh>

        {/* Hair */}
        <mesh position={[0, 44, -3]}>
          <sphereGeometry args={[13, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-5, 38, 12]}>
          <sphereGeometry args={[2.5, 8, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[5, 38, 12]}>
          <sphereGeometry args={[2.5, 8, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>

        {/* Eye highlights */}
        <mesh position={[-4, 39, 14]}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
        <mesh position={[6, 39, 14]}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial color="#fff" />
        </mesh>

        {/* Blush */}
        <mesh position={[-10, 34, 10]} rotation={[0, 0.3, 0]}>
          <circleGeometry args={[3, 12]} />
          <meshStandardMaterial color="#fca5a5" transparent opacity={0.5} />
        </mesh>
        <mesh position={[10, 34, 10]} rotation={[0, -0.3, 0]}>
          <circleGeometry args={[3, 12]} />
          <meshStandardMaterial color="#fca5a5" transparent opacity={0.5} />
        </mesh>

        {/* Mouth */}
        <mesh position={[0, 32, 13]}>
          <boxGeometry args={[5, 2, 1]} />
          <meshStandardMaterial color="#f87171" />
        </mesh>

        {/* Online status */}
        <mesh position={[10, 50, 0]}>
          <sphereGeometry args={[4, 12, 12]} />
          <meshStandardMaterial
            color={isOnline ? "#22c55e" : "#64748b"}
            emissive={isOnline ? "#22c55e" : "#64748b"}
            emissiveIntensity={isOnline ? 0.5 : 0.1}
          />
        </mesh>

        {/* Self indicator */}
        {isSelf && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
            <ringGeometry args={[14, 17, 24]} />
            <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={0.6} />
          </mesh>
        )}

        {/* Name label */}
        <Billboard position={[0, 65, 0]}>
          <Text
            fontSize={10}
            color="#ffffff"
            outlineWidth={0.5}
            outlineColor={isSelf ? "#8b5cf6" : "#000"}
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      </group>
    );
  }
);

function PlayerAvatar({
  posRef,
  dirRef,
  currentUser,
}: {
  posRef: { current: Pos };
  dirRef: { current: Dir };
  currentUser: CurrentUser;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const walkTimeRef = useRef(0);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const [x, y, z] = toScene(posRef.current.x, posRef.current.y);
    g.position.set(x, y, z);
    g.rotation.y = dirToRadians(dirRef.current);

    // Walking bob animation
    walkTimeRef.current += delta * 10;
    g.position.y = Math.sin(walkTimeRef.current) * 2;
  });

  return (
    <ChibiAvatar
      ref={groupRef}
      color={DIVISION_COLORS[currentUser.division]}
      label={`${currentUser.fullName} (Kamu)`}
      isSelf
      isOnline
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
    g.position.lerp(new THREE.Vector3(x, y, z), 0.1);
    if (rp) g.rotation.y = dirToRadians(rp.dir);
  });

  return (
    <ChibiAvatar
      ref={groupRef}
      color={DIVISION_COLORS[entry.division]}
      label={entry.fullName}
      isSelf={false}
      isOnline
    />
  );
}

function AgentNPC({ agent, x, y }: { agent: AIAgent; x: number; y: number }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const bodyRef = useRef<THREE.Group | null>(null);
  const [sx, , sz] = toScene(x, y);

  const colors: Record<string, string> = {
    nova: "#8b5cf6",
    reno: "#10b981",
    crea: "#ec4899",
    fabr: "#f59e0b",
    finn: "#0ea5e9",
  };
  const color = colors[agent.id] ?? "#8b5cf6";

  useFrame((state) => {
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 3;
      bodyRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group ref={groupRef} position={[sx, 0, sz]}>
      {/* Glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <ringGeometry args={[16, 22, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} />
      </mesh>

      {/* Robot body */}
      <group ref={bodyRef}>
        {/* Body */}
        <mesh position={[0, 16, 0]}>
          <capsuleGeometry args={[10, 10, 8, 12]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 38, 0]}>
          <boxGeometry args={[20, 16, 14]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
        </mesh>

        {/* Face screen */}
        <mesh position={[0, 38, 7.5]}>
          <boxGeometry args={[16, 10, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-4, 39, 8]}>
          <boxGeometry args={[4, 4, 0.5]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[4, 39, 8]}>
          <boxGeometry args={[4, 4, 0.5]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.4} />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, 50, 0]}>
          <cylinderGeometry args={[2, 2, 8, 8]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
        <mesh position={[0, 56, 0]}>
          <sphereGeometry args={[4, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      </group>

      {/* Label */}
      <Billboard position={[0, 70, 0]}>
        <Text
          fontSize={10}
          color="#ffffff"
          outlineWidth={0.6}
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

/* ------------------------------------------------------------------ */
/* Game Loop                                                           */
/* ------------------------------------------------------------------ */

function GameLoop({
  keysRef,
  posRef,
  dirRef,
  channelRef,
  lastBroadcastRef,
  lastRoomLabelRef,
  lastNearbyIdRef,
  lastNearbyAgentRef,
  remoteRef,
  currentUser,
  rosterById,
  setRoomLabel,
  setNearby,
  setNearbyAgent,
}: {
  keysRef: { current: Set<string> };
  posRef: { current: Pos };
  dirRef: { current: Dir };
  channelRef: { current: RealtimeChannel | null };
  lastBroadcastRef: { current: number };
  lastRoomLabelRef: { current: string };
  lastNearbyIdRef: { current: string | null };
  lastNearbyAgentRef: { current: string | null };
  remoteRef: { current: Map<string, RemotePos> };
  currentUser: CurrentUser;
  rosterById: Map<string, OfficeRosterEntry>;
  setRoomLabel: (label: string) => void;
  setNearby: (entry: OfficeRosterEntry | null) => void;
  setNearbyAgent: (agent: AIAgent | null) => void;
}) {
  const { camera } = useThree();
  const cameraReadyRef = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;

    // Movement
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

    // Broadcast position
    const now = performance.now();
    if (now - lastBroadcastRef.current > BROADCAST_INTERVAL_MS) {
      lastBroadcastRef.current = now;
      channelRef.current?.send({
        type: "broadcast",
        event: "move",
        payload: { id: currentUser.id, x: posRef.current.x, y: posRef.current.y, dir: dirRef.current },
      });
    }

    // Update room label
    const room = getRoomAt(posRef.current.x, posRef.current.y);
    const label = room?.label ?? "Lobby";
    if (label !== lastRoomLabelRef.current) {
      lastRoomLabelRef.current = label;
      setRoomLabel(label);
    }

    // Check nearby players
    let closestId: string | null = null;
    let closestDist = INTERACTION_RADIUS;
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

    // Check nearby AI agents
    let closestAgentId: string | null = null;
    let closestAgentDist = INTERACTION_RADIUS;
    for (const npcPos of AGENT_NPC_POSITIONS) {
      const d = Math.hypot(npcPos.x - posRef.current.x, npcPos.y - posRef.current.y);
      if (d < closestAgentDist) {
        closestAgentDist = d;
        closestAgentId = npcPos.agentId;
      }
    }
    if (closestAgentId !== lastNearbyAgentRef.current) {
      lastNearbyAgentRef.current = closestAgentId;
      setNearbyAgent(closestAgentId ? getAgentById(closestAgentId) ?? null : null);
    }

    // Camera follow
    const [sx, sy, sz] = toScene(posRef.current.x, posRef.current.y);
    const targetX = sx + CAMERA_OFFSET.x;
    const targetY = sy + CAMERA_OFFSET.y;
    const targetZ = sz + CAMERA_OFFSET.z;

    if (!cameraReadyRef.current) {
      camera.position.set(targetX, targetY, targetZ);
      cameraReadyRef.current = true;
    } else {
      camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
    }
    camera.lookAt(sx, sy + 30, sz);
  });

  return null;
}
