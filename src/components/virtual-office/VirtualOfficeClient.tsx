"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  ChevronRight,
  Coffee,
  Home,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Search,
  Settings,
  Users,
  X,
  Zap,
  Activity,
  Calendar,
  TrendingUp
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import type { Division } from "@/lib/supabase/types";
import type { OfficeRosterEntry } from "@/lib/virtual-office/data";
import type { OfficeRoom } from "@/lib/virtual-office/map";
import {
  AGENT_NPC_POSITIONS,
  DIVISION_COLORS,
  ROOMS,
  WORLD_H,
  WORLD_W,
} from "@/lib/virtual-office/map";
import { getAgentById, type AIAgent } from "@/lib/ai/agents";

/**
 * Virtual Office v2 - Isometric Interactive Workspace
 *
 * Konsep: "Living Application" - visualisasi aktivitas operasional
 * dalam bentuk kantor isometrik interaktif, bukan sekadar dashboard.
 *
 * Features:
 * - Fixed isometric camera (tidak follow player)
 * - Click-to-zoom pada area
 * - Status indicators pada karakter
 * - Glassmorphism UI overlay
 * - Real-time presence & activities
 */

type CurrentUser = { id: string; fullName: string; username: string | null; division: Division };
type RemotePresence = { id: string; status: "online" | "busy" | "away"; activity?: string };

const CHANNEL_NAME = "kantor-virtual-v2";

// Isometric camera settings
const ISO_ANGLE = Math.PI / 6; // 30 degrees
const CAMERA_ZOOM = 0.8;

// Room data with activities
type RoomData = {
  room: OfficeRoom;
  occupants: OfficeRosterEntry[];
  activities: number;
  notifications: number;
};

export function VirtualOfficeClient({
  currentUser,
  roster,
}: {
  currentUser: CurrentUser;
  roster: OfficeRosterEntry[];
}) {
  const rosterById = useMemo(() => new Map(roster.map((r) => [r.id, r])), [roster]);

  // UI State
  const [selectedRoom, setSelectedRoom] = useState<OfficeRoom | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<OfficeRosterEntry | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState(3); // Mock notifications

  // Realtime presence
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, RemotePresence>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Camera state for zoom
  const [cameraTarget, setCameraTarget] = useState<{ x: number; y: number; zoom: number }>({
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    zoom: CAMERA_ZOOM
  });

  // Realtime connection
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: currentUser.id } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const ids = Object.keys(state);
      setOnlineIds(ids);

      const newPresenceMap = new Map<string, RemotePresence>();
      ids.forEach(id => {
        newPresenceMap.set(id, {
          id,
          status: "online",
          activity: "Working"
        });
      });
      setPresenceMap(newPresenceMap);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({
          onlineAt: new Date().toISOString(),
          status: "online",
          activity: "Viewing Office"
        });
      }
    });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  // Build room data with occupants
  const roomsData = useMemo<RoomData[]>(() => {
    return ROOMS.map(room => {
      const occupants = roster.filter(r => {
        if (room.division === null) return false;
        if (room.division === "all") return r.division === "all";
        return r.division === room.division;
      });

      return {
        room,
        occupants: occupants.slice(0, 5),
        activities: Math.floor(Math.random() * 5),
        notifications: room.id === "magnarent-desk" ? 2 : room.id === "meeting-room" ? 1 : 0,
      };
    });
  }, [roster]);

  // Handle room click
  const handleRoomClick = useCallback((room: OfficeRoom) => {
    setSelectedRoom(room);
    setSelectedPerson(null);
    setSelectedAgent(null);
    setCameraTarget({
      x: room.rect.x + room.rect.w / 2,
      y: room.rect.y + room.rect.h / 2,
      zoom: 1.5
    });
  }, []);

  // Handle person click
  const handlePersonClick = useCallback((person: OfficeRosterEntry) => {
    setSelectedPerson(person);
    setSelectedRoom(null);
    setSelectedAgent(null);
  }, []);

  // Handle agent click
  const handleAgentClick = useCallback((agent: AIAgent) => {
    setSelectedAgent(agent);
    setSelectedRoom(null);
    setSelectedPerson(null);
  }, []);

  // Reset view
  const resetView = useCallback(() => {
    setSelectedRoom(null);
    setSelectedPerson(null);
    setSelectedAgent(null);
    setCameraTarget({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: CAMERA_ZOOM });
  }, []);

  // Get status color
  const getStatusColor = (id: string) => {
    if (onlineIds.includes(id)) return "#22c55e";
    return "#94a3b8";
  };

  return (
    <div className="relative h-[calc(100vh-6rem)] w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-white/10 transition"
          >
            <LayoutGrid className="h-5 w-5 text-white/70" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white">Virtual Office</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms, people, activities..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-violet-500/50"
            />
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg hover:bg-white/10 transition">
            <Bell className="h-5 w-5 text-white/70" />
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                {notifications}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white">
              {currentUser.fullName.charAt(0)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-white">{currentUser.fullName}</p>
              <p className="text-[10px] text-white/50 capitalize">{currentUser.division}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "absolute top-14 left-0 bottom-0 z-10 w-64 backdrop-blur-xl bg-slate-900/80 border-r border-white/10 transition-transform duration-300",
        !sidebarOpen && "-translate-x-full"
      )}>
        <div className="p-4 space-y-6">
          {/* Quick Stats */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Overview</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Users className="h-4 w-4" />
                  <span className="text-lg font-bold">{onlineIds.length}</span>
                </div>
                <p className="text-[10px] text-white/50 mt-1">Online Now</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-amber-400">
                  <Activity className="h-4 w-4" />
                  <span className="text-lg font-bold">12</span>
                </div>
                <p className="text-[10px] text-white/50 mt-1">Active Tasks</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Navigation</h3>
            <nav className="space-y-1">
              <button
                onClick={resetView}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <Home className="h-4 w-4" />
                <span>Overview</span>
              </button>
              {ROOMS.map(room => (
                <button
                  key={room.id}
                  onClick={() => handleRoomClick(room)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition",
                    selectedRoom?.id === room.id
                      ? "bg-violet-500/20 text-violet-300"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: room.accentColor }}
                    />
                    <span className="truncate">{room.label}</span>
                  </div>
                  {roomsData.find(r => r.room.id === room.id)?.notifications ? (
                    <span className="h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                      {roomsData.find(r => r.room.id === room.id)?.notifications}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>

          {/* AI Agents */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">AI Assistants</h3>
            <div className="space-y-1">
              {AGENT_NPC_POSITIONS.map(pos => {
                const agent = getAgentById(pos.agentId);
                if (!agent) return null;
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentClick(agent)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                      selectedAgent?.id === agent.id
                        ? "bg-violet-500/20 text-violet-300"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className="text-lg">{agent.icon}</span>
                    <div className="text-left">
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-[10px] text-white/50">{agent.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={cn(
        "absolute top-14 bottom-0 right-0 transition-all duration-300",
        sidebarOpen ? "left-64" : "left-0"
      )}>
        <Canvas
          style={{ width: "100%", height: "100%" }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          orthographic
        >
          <IsometricScene
            roomsData={roomsData}
            roster={roster}
            onlineIds={onlineIds}
            currentUser={currentUser}
            cameraTarget={cameraTarget}
            onRoomClick={handleRoomClick}
            onPersonClick={handlePersonClick}
            onAgentClick={handleAgentClick}
            selectedRoom={selectedRoom}
          />
        </Canvas>
      </div>

      {/* Detail Panel - Room */}
      {selectedRoom && (
        <DetailPanel onClose={resetView}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: selectedRoom.accentColor + "30" }}
            >
              <Monitor className="h-5 w-5" style={{ color: selectedRoom.accentColor }} />
            </div>
            <div>
              <h3 className="font-bold text-white">{selectedRoom.label}</h3>
              <p className="text-xs text-white/50">
                {selectedRoom.division ? `Division: ${selectedRoom.division}` : "Shared Space"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard icon={Users} label="Occupants" value={roomsData.find(r => r.room.id === selectedRoom.id)?.occupants.length || 0} color="cyan" />
            <StatCard icon={Activity} label="Activities" value={roomsData.find(r => r.room.id === selectedRoom.id)?.activities || 0} color="amber" />
            <StatCard icon={Bell} label="Alerts" value={roomsData.find(r => r.room.id === selectedRoom.id)?.notifications || 0} color="red" />
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase">Team Members</h4>
            {roomsData.find(r => r.room.id === selectedRoom.id)?.occupants.map(person => (
              <button
                key={person.id}
                onClick={() => handlePersonClick(person)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition"
              >
                <div className="relative">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: DIVISION_COLORS[person.division] }}
                  >
                    {person.fullName.charAt(0)}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-800"
                    style={{ backgroundColor: getStatusColor(person.id) }}
                  />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">{person.fullName}</p>
                  <p className="text-[10px] text-white/50 capitalize">{person.division}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30" />
              </button>
            ))}
          </div>
        </DetailPanel>
      )}

      {/* Detail Panel - Person */}
      {selectedPerson && (
        <DetailPanel onClose={resetView}>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: DIVISION_COLORS[selectedPerson.division] }}
              >
                {selectedPerson.fullName.charAt(0)}
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-slate-800"
                style={{ backgroundColor: getStatusColor(selectedPerson.id) }}
              />
            </div>
            <div>
              <h3 className="font-bold text-white">{selectedPerson.fullName}</h3>
              <p className="text-xs text-white/50 capitalize">{selectedPerson.division}</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
              <span className="text-sm text-white/70">Status</span>
              <span className={cn(
                "text-sm font-medium",
                onlineIds.includes(selectedPerson.id) ? "text-emerald-400" : "text-white/50"
              )}>
                {onlineIds.includes(selectedPerson.id) ? "Online" : "Offline"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
              <span className="text-sm text-white/70">Activity</span>
              <span className="text-sm text-white">Working</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
              <span className="text-sm text-white/70">Tasks</span>
              <span className="text-sm text-amber-400">3 pending</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/dashboard/chat?mention=${selectedPerson.username || ""}`}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition"
            >
              <MessageSquare className="h-4 w-4" />
              Message
            </Link>
            <button className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition">
              View Profile
            </button>
          </div>
        </DetailPanel>
      )}

      {/* Detail Panel - Agent */}
      {selectedAgent && (
        <DetailPanel onClose={resetView}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center text-2xl",
              `bg-gradient-to-br ${selectedAgent.color}`
            )}>
              {selectedAgent.icon}
            </div>
            <div>
              <h3 className="font-bold text-white">{selectedAgent.name}</h3>
              <p className="text-xs text-white/50">{selectedAgent.description}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4">
            <p className="text-sm text-white/70">
              {selectedAgent.id === "nova" && "Your all-in-one assistant. Ask me anything about the application, data, or get help with any module."}
              {selectedAgent.id === "reno" && "Specialized in Magnarent. I can help with bookings, inventory, availability checks, and rental analytics."}
              {selectedAgent.id === "crea" && "Your creative partner for Magnative. I handle clients, projects, content planning, and creative brainstorming."}
              {selectedAgent.id === "fabr" && "Production expert. I manage materials, booth projects, and help calculate project requirements."}
              {selectedAgent.id === "finn" && "Finance analyst. I track expenses, invoices, and provide financial insights and reports."}
            </p>
          </div>

          <Link
            href={`/dashboard/ai-assistant?agent=${selectedAgent.id}`}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-medium transition",
              `bg-gradient-to-r ${selectedAgent.color} hover:opacity-90`
            )}
          >
            <Zap className="h-4 w-4" />
            Start Conversation
          </Link>
        </DetailPanel>
      )}

      {/* Bottom Stats Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 backdrop-blur-xl bg-slate-900/70 border-t border-white/10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{onlineIds.length} online</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Calendar className="h-3 w-3" />
            <span>3 meetings today</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <TrendingUp className="h-3 w-3" />
            <span>Activity: High</span>
          </div>
        </div>
        <div className="text-xs text-white/30">
          Click on rooms or characters to interact
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UI Components                                                       */
/* ------------------------------------------------------------------ */

function DetailPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute top-14 right-0 bottom-0 w-80 z-30 backdrop-blur-xl bg-slate-900/90 border-l border-white/10 p-4 overflow-y-auto">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/10 transition"
      >
        <X className="h-4 w-4 text-white/50" />
      </button>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400",
    amber: "text-amber-400",
    red: "text-red-400",
    emerald: "text-emerald-400",
  };
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
      <Icon className={cn("h-4 w-4 mx-auto mb-1", colors[color])} />
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/50">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3D Scene - Isometric View                                          */
/* ------------------------------------------------------------------ */

function IsometricScene({
  roomsData,
  roster,
  onlineIds,
  currentUser,
  cameraTarget,
  onRoomClick,
  onPersonClick,
  onAgentClick,
  selectedRoom,
}: {
  roomsData: RoomData[];
  roster: OfficeRosterEntry[];
  onlineIds: string[];
  currentUser: { id: string; fullName: string; division: Division };
  cameraTarget: { x: number; y: number; zoom: number };
  onRoomClick: (room: OfficeRoom) => void;
  onPersonClick: (person: OfficeRosterEntry) => void;
  onAgentClick: (agent: AIAgent) => void;
  selectedRoom: OfficeRoom | null;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3());

  // Smooth camera movement
  useFrame(() => {
    const targetX = cameraTarget.x - WORLD_W / 2;
    const targetZ = cameraTarget.y - WORLD_H / 2;
    targetRef.current.set(targetX, 0, targetZ);

    // Smooth interpolation
    camera.position.lerp(
      new THREE.Vector3(
        targetX + 400 * cameraTarget.zoom,
        500 * cameraTarget.zoom,
        targetZ + 400 * cameraTarget.zoom
      ),
      0.05
    );
    camera.lookAt(targetRef.current);

    if (camera instanceof THREE.OrthographicCamera) {
      const targetZoom = 0.5 / cameraTarget.zoom;
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetZoom, 0.05);
      camera.updateProjectionMatrix();
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[300, 500, 300]} intensity={0.8} color="#fff5eb" />
      <directionalLight position={[-200, 300, -200]} intensity={0.3} color="#e0f2fe" />
      <hemisphereLight args={["#bfdbfe", "#86efac", 0.4]} />

      {/* Ground */}
      <Ground />

      {/* Building Base */}
      <BuildingBase />

      {/* Rooms */}
      {roomsData.map(({ room, occupants, notifications }) => (
        <Room
          key={room.id}
          room={room}
          occupants={occupants}
          notifications={notifications}
          isSelected={selectedRoom?.id === room.id}
          onClick={() => onRoomClick(room)}
        />
      ))}

      {/* Characters */}
      {roster.slice(0, 15).map((person, i) => (
        <Character
          key={person.id}
          person={person}
          position={getCharacterPosition(person, i)}
          isOnline={onlineIds.includes(person.id)}
          isSelf={person.id === currentUser.id}
          onClick={() => onPersonClick(person)}
        />
      ))}

      {/* AI Agents */}
      {AGENT_NPC_POSITIONS.map(pos => {
        const agent = getAgentById(pos.agentId);
        if (!agent) return null;
        return (
          <AgentNPC
            key={agent.id}
            agent={agent}
            x={pos.x}
            y={pos.y}
            onClick={() => onAgentClick(agent)}
          />
        );
      })}

      {/* Camera */}
      <OrthographicCamera makeDefault position={[400, 500, 400]} zoom={0.5} />
    </>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
      <planeGeometry args={[WORLD_W + 200, WORLD_H + 200]} />
      <meshStandardMaterial color="#1e293b" />
    </mesh>
  );
}

function BuildingBase() {
  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[WORLD_W, WORLD_H]} />
        <meshStandardMaterial color="#334155" metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Floor pattern - corridors */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <planeGeometry args={[50, WORLD_H]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <planeGeometry args={[WORLD_W, 50]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
}

function Room({
  room,
  occupants,
  notifications,
  isSelected,
  onClick,
}: {
  room: OfficeRoom;
  occupants: OfficeRosterEntry[];
  notifications: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const x = room.rect.x + room.rect.w / 2 - WORLD_W / 2;
  const z = room.rect.y + room.rect.h / 2 - WORLD_H / 2;

  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <planeGeometry args={[room.rect.w - 10, room.rect.h - 10]} />
        <meshStandardMaterial
          color={room.accentColor}
          transparent
          opacity={isSelected ? 0.4 : hovered ? 0.25 : 0.15}
        />
      </mesh>

      {/* Walls - Glass partitions */}
      <GlassWall position={[-room.rect.w / 2 + 3, 20, 0]} size={[3, 40, room.rect.h - 10]} color={room.accentColor} />
      <GlassWall position={[0, 20, -room.rect.h / 2 + 3]} size={[room.rect.w - 10, 40, 3]} color={room.accentColor} />

      {/* Desk */}
      <ModernDesk position={[0, 0, 0]} width={room.rect.w * 0.4} />

      {/* Notification indicator */}
      {notifications > 0 && (
        <group position={[room.rect.w / 2 - 20, 60, -room.rect.h / 2 + 20]}>
          <mesh>
            <sphereGeometry args={[8, 16, 16]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
          </mesh>
          <Text
            position={[0, 0, 9]}
            fontSize={8}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {notifications}
          </Text>
        </group>
      )}

      {/* Room label */}
      <Text
        position={[0, 2, room.rect.h / 2 - 15]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={12}
        color={room.accentColor}
        anchorX="center"
        anchorY="middle"
      >
        {room.label}
      </Text>
    </group>
  );
}

function GlassWall({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.15} metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

function ModernDesk({ position, width }: { position: [number, number, number]; width: number }) {
  return (
    <group position={position}>
      {/* Desk top */}
      <mesh position={[0, 28, 0]}>
        <boxGeometry args={[width, 3, width * 0.4]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.1} roughness={0.3} />
      </mesh>
      {/* Legs */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx * (width / 2 - 5), 14, lz * (width * 0.15)]}>
          <boxGeometry args={[3, 28, 3]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 40, -width * 0.1]}>
        <boxGeometry args={[width * 0.3, 20, 2]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 40, -width * 0.1 + 1.5]}>
        <boxGeometry args={[width * 0.28, 18, 0.5]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function Character({
  person,
  position,
  isOnline,
  isSelf,
  onClick,
}: {
  person: OfficeRosterEntry;
  position: [number, number, number];
  isOnline: boolean;
  isSelf: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Subtle idle animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 1;
    }
  });

  const color = DIVISION_COLORS[person.division];

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <circleGeometry args={[8, 16]} />
        <meshStandardMaterial color="#000" transparent opacity={0.3} />
      </mesh>

      {/* Body - Chibi style */}
      <mesh position={[0, 10, 0]}>
        <capsuleGeometry args={[6, 8, 8, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Head - Big chibi head */}
      <mesh position={[0, 26, 0]}>
        <sphereGeometry args={[10, 20, 20]} />
        <meshStandardMaterial color="#fef3c7" />
      </mesh>

      {/* Hair */}
      <mesh position={[0, 30, -2]}>
        <sphereGeometry args={[9, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-3.5, 26, 8]}>
        <sphereGeometry args={[1.8, 8, 8]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[3.5, 26, 8]}>
        <sphereGeometry args={[1.8, 8, 8]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Status indicator */}
      <mesh position={[8, 34, 0]}>
        <sphereGeometry args={[3, 12, 12]} />
        <meshStandardMaterial
          color={isOnline ? "#22c55e" : "#94a3b8"}
          emissive={isOnline ? "#22c55e" : "#94a3b8"}
          emissiveIntensity={isOnline ? 0.5 : 0.1}
        />
      </mesh>

      {/* Self indicator ring */}
      {isSelf && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
          <ringGeometry args={[10, 12, 24]} />
          <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Name on hover */}
      {hovered && (
        <Text
          position={[0, 45, 0]}
          fontSize={8}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000"
        >
          {person.fullName}
        </Text>
      )}
    </group>
  );
}

function AgentNPC({
  agent,
  x,
  y,
  onClick,
}: {
  agent: AIAgent;
  x: number;
  y: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const sx = x - WORLD_W / 2;
  const sz = y - WORLD_H / 2;

  const colors: Record<string, string> = {
    nova: "#8b5cf6",
    reno: "#10b981",
    crea: "#ec4899",
    fabr: "#f59e0b",
    finn: "#0ea5e9",
  };
  const color = colors[agent.id] ?? "#8b5cf6";

  // Floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 3;
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <group
      position={[sx, 0, sz]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <ringGeometry args={[12, 16, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Robot body */}
      <group ref={groupRef}>
        {/* Body */}
        <mesh position={[0, 14, 0]}>
          <capsuleGeometry args={[7, 6, 8, 12]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 30, 0]}>
          <boxGeometry args={[16, 12, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
        </mesh>

        {/* Face screen */}
        <mesh position={[0, 30, 6.5]}>
          <boxGeometry args={[12, 8, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.8 : 0.4} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-3, 31, 7]}>
          <boxGeometry args={[3, 3, 0.5]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[3, 31, 7]}>
          <boxGeometry args={[3, 3, 0.5]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.3} />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, 38, 0]}>
          <cylinderGeometry args={[1, 1, 4, 8]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
        <mesh position={[0, 41, 0]}>
          <sphereGeometry args={[2.5, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1 : 0.5} />
        </mesh>
      </group>

      {/* Label */}
      <Text
        position={[0, 52, 0]}
        fontSize={8}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.5}
        outlineColor={color}
      >
        {agent.icon} {agent.name}
      </Text>
    </group>
  );
}

// Helper function to position characters
function getCharacterPosition(person: OfficeRosterEntry, index: number): [number, number, number] {
  const room = ROOMS.find(r => r.division === person.division) || ROOMS[0];
  const baseX = room.rect.x + room.rect.w / 2 - WORLD_W / 2;
  const baseZ = room.rect.y + room.rect.h / 2 - WORLD_H / 2;

  const offsetX = ((index % 3) - 1) * 30;
  const offsetZ = (Math.floor(index / 3) - 1) * 30;

  return [baseX + offsetX, 0, baseZ + offsetZ + 40];
}
