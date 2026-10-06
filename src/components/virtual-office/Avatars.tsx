"use client";

import { Suspense, forwardRef, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { AIAgent } from "@/lib/ai/agents";
import type { AvatarLook } from "@/lib/virtual-office/avatar-look";
import { SPAWN, type Dir, type Pos, type RemotePos } from "@/lib/virtual-office/house";
import { toScene } from "./HouseScene";

// Re-export supaya kode lama yang mengimpor Dir/RemotePos dari "./Avatars"
// (bukan langsung dari house.ts) tidak perlu diubah.
export type { Dir, RemotePos };

const DIR_VECTORS: Record<Dir, { x: number; z: number }> = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

export function dirToRadians(dir: Dir): number {
  const v = DIR_VECTORS[dir];
  return Math.atan2(v.x, v.z);
}

function Hair({ look }: { look: AvatarLook }) {
  switch (look.hairStyle) {
    case "botak":
      return null;
    case "pendek":
      return (
        <mesh position={[0, 41, -1]}>
          <sphereGeometry args={[12.6, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={look.hair} />
        </mesh>
      );
    case "panjang":
      return (
        <group>
          <mesh position={[0, 41, -1]}>
            <sphereGeometry args={[12.8, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
          <mesh position={[0, 30, -7]}>
            <boxGeometry args={[22, 22, 6]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        </group>
      );
    case "topi":
      return (
        <group>
          <mesh position={[0, 46, 0]}>
            <cylinderGeometry args={[12, 12.5, 8, 18]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
          <mesh position={[0, 42.5, 9]}>
            <boxGeometry args={[18, 1.5, 10]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        </group>
      );
    case "hijab":
      // Bola terbuka di bagian depan supaya wajah tetap terlihat, ditambah
      // kain yang jatuh ke bahu.
      return (
        <group>
          <mesh position={[0, 38, 0]}>
            <sphereGeometry args={[13.6, 20, 20, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7]} />
            <meshStandardMaterial color={look.hair} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[11, 15, 8, 18]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

function Accessory({ look }: { look: AvatarLook }) {
  if (look.accessory === "kacamata") {
    return (
      <group>
        {[-5, 5].map((x) => (
          <mesh key={x} position={[x, 36, 12.6]}>
            <torusGeometry args={[3.2, 0.7, 6, 16]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        ))}
        <mesh position={[0, 36, 12.6]}>
          <boxGeometry args={[3, 0.8, 0.8]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      </group>
    );
  }
  if (look.accessory === "headphone") {
    return (
      <group>
        <mesh position={[0, 38, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[13.5, 1.4, 6, 20, Math.PI]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {[-13, 13].map((x) => (
          <mesh key={x} position={[x, 36, 0]}>
            <boxGeometry args={[4, 8, 7]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
        ))}
      </group>
    );
  }
  return null;
}

/** Karakter chibi. `sleeping`: rebah telentang (dipakai di Kamar Staff). */
export const ChibiAvatar = forwardRef<
  THREE.Group,
  { look: AvatarLook; label: string; isSelf?: boolean; sleeping?: boolean }
>(function ChibiAvatar({ look, label, isSelf = false, sleeping = false }, ref) {
  return (
    <group ref={ref}>
      <group rotation={sleeping ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} position={sleeping ? [0, 6, 20] : [0, 0, 0]}>
        {!sleeping && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
            <circleGeometry args={[11, 16]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.3} />
          </mesh>
        )}
        {/* Kaki */}
        {[-4.5, 4.5].map((x) => (
          <mesh key={x} position={[x, 5, 0]}>
            <capsuleGeometry args={[3.2, 5, 4, 8]} />
            <meshStandardMaterial color={look.pants} />
          </mesh>
        ))}
        {/* Badan & lengan */}
        <mesh position={[0, 16, 0]}>
          <capsuleGeometry args={[7.5, 9, 8, 12]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
        {[-11, 11].map((x) => (
          <mesh key={x} position={[x, 17, 0]}>
            <capsuleGeometry args={[3.3, 7, 4, 8]} />
            <meshStandardMaterial color={look.shirt} />
          </mesh>
        ))}
        {/* Kepala */}
        <mesh position={[0, 36, 0]}>
          <sphereGeometry args={[12.5, 20, 20]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>
        {/* Mata: tertutup kalau tidur */}
        {[-5, 5].map((x) =>
          sleeping ? (
            <mesh key={x} position={[x, 36, 12]}>
              <boxGeometry args={[4, 0.8, 0.8]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          ) : (
            <mesh key={x} position={[x, 36, 11.6]}>
              <sphereGeometry args={[2.2, 8, 8]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          )
        )}
        <mesh position={[0, 30.5, 11.8]}>
          <boxGeometry args={[4, 1.5, 1]} />
          <meshStandardMaterial color="#b91c1c" />
        </mesh>
        <Hair look={look} />
        <Accessory look={look} />
      </group>

      {isSelf && !sleeping && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
          <ringGeometry args={[13, 16, 24]} />
          <meshStandardMaterial color="#a78bfa" emissive="#8b5cf6" emissiveIntensity={0.6} />
        </mesh>
      )}

      <Billboard position={[0, sleeping ? 30 : 62, sleeping ? 10 : 0]}>
        <Suspense fallback={null}>
        <Text
          fontSize={sleeping ? 7 : 9}
          color={sleeping ? "#cbd5e1" : "#ffffff"}
          outlineWidth={0.5}
          outlineColor={isSelf ? "#7c3aed" : "#000000"}
          anchorX="center"
          anchorY="middle"
        >
          {sleeping ? `${label} · zZ` : label}
        </Text>
        </Suspense>
      </Billboard>
    </group>
  );
});

export function PlayerAvatar({
  posRef,
  dirRef,
  look,
  label,
}: {
  posRef: { current: Pos };
  dirRef: { current: Dir };
  look: AvatarLook;
  label: string;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const lastRef = useRef<Pos | null>(null);
  const walkRef = useRef(0);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const last = lastRef.current;
    const moving = last !== null && (last.x !== posRef.current.x || last.y !== posRef.current.y);
    lastRef.current = { ...posRef.current };
    walkRef.current = moving ? walkRef.current + delta * 12 : 0;
    const [x, , z] = toScene(posRef.current.x, posRef.current.y);
    g.position.set(x, moving ? Math.abs(Math.sin(walkRef.current)) * 2.5 : 0, z);
    g.rotation.y = dirToRadians(dirRef.current);
  });

  return <ChibiAvatar ref={groupRef} look={look} label={label} isSelf />;
}

export function RemoteAvatar({
  id,
  remoteRef,
  look,
  label,
}: {
  id: string;
  remoteRef: { current: Map<string, RemotePos> };
  look: AvatarLook;
  label: string;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const targetRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const rp = remoteRef.current.get(id);
    const [x, y, z] = toScene(rp?.x ?? SPAWN.x, rp?.y ?? SPAWN.y);
    // Pindah lantai (tangga) = lompat langsung, bukan meluncur melintasi peta.
    if (g.position.distanceTo(targetRef.current.set(x, y, z)) > 300) g.position.copy(targetRef.current);
    else g.position.lerp(targetRef.current, 0.15);
    if (rp) g.rotation.y = dirToRadians(rp.dir);
  });

  return <ChibiAvatar ref={groupRef} look={look} label={label} />;
}

/** Orang yang sedang "online" (membuka MagnaSuperApp) tapi TIDAK sedang di
 * halaman Kantor Virtual -- berdiri diam di meja divisinya (lihat
 * deskForDivision di house.ts), bukan ikut berjalan karena tidak ada
 * posisi live untuknya. Beda dari SleeperAvatar (itu utk yang app-nya
 * benar-benar tertutup/offline). */
export function DeskAvatar({ x, y, look, label }: { x: number; y: number; look: AvatarLook; label: string }) {
  const [sx, , sz] = toScene(x, y);
  return (
    <group position={[sx, 0, sz]}>
      <ChibiAvatar look={look} label={label} />
    </group>
  );
}

export function SleeperAvatar({ x, y, level, look, label }: { x: number; y: number; level: 0 | 1; look: AvatarLook; label: string }) {
  const [sx, , sz] = toScene(x, y);
  // Kepala di sisi bantal (kiri kasur), badan memanjang ke kanan.
  return (
    <group position={[sx + 3, level === 0 ? 12 : 40, sz]} rotation={[0, Math.PI / 2, 0]} scale={0.62}>
      <ChibiAvatar look={look} label={label} sleeping />
    </group>
  );
}

const AGENT_COLORS: Record<string, string> = {
  nova: "#8b5cf6",
  reno: "#10b981",
  crea: "#ec4899",
  fabr: "#f59e0b",
  finn: "#0ea5e9",
};

export function AgentNPC({ agent, x, y }: { agent: AIAgent; x: number; y: number }) {
  const bodyRef = useRef<THREE.Group | null>(null);
  const [sx, , sz] = toScene(x, y);
  const color = AGENT_COLORS[agent.id] ?? "#8b5cf6";

  useFrame((state) => {
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 2.5;
      bodyRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.6;
    }
  });

  return (
    <group position={[sx, 0, sz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
        <ringGeometry args={[14, 19, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} />
      </mesh>
      <group ref={bodyRef}>
        <mesh position={[0, 15, 0]}>
          <capsuleGeometry args={[9, 9, 8, 12]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, 35, 0]}>
          <boxGeometry args={[18, 14, 13]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, 35, 6.8]}>
          <boxGeometry args={[14, 9, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 50, 0]}>
          <sphereGeometry args={[3.5, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      </group>
      <Billboard position={[0, 64, 0]}>
        <Suspense fallback={null}>
        <Text fontSize={9} color="#ffffff" outlineWidth={0.6} outlineColor={color} anchorX="center" anchorY="middle">
          {`${agent.icon} ${agent.name}`}
        </Text>
        </Suspense>
      </Billboard>
    </group>
  );
}
