"use client";

import { Suspense } from "react";
import { Billboard, Text } from "@react-three/drei";
import {
  ARTWORKS,
  FENCE,
  FLOOR2_BOUNDS,
  FURNITURE,
  GROUND_BOUNDS,
  OUTBUILDING_WALLS,
  OWNER_DOOR,
  ROOMS,
  SIGNS,
  STAIRS_DOWN_ZONE,
  WALLS,
  WALL_HEIGHT,
  WINDOWS,
  getRoom,
  type Furniture,
  type Rect,
} from "@/lib/virtual-office/house";

/** Pusat lantai 1 dipakai sebagai titik nol scene 3D. */
const ORIGIN_X = GROUND_BOUNDS.x + GROUND_BOUNDS.w / 2;
const ORIGIN_Y = GROUND_BOUNDS.y + GROUND_BOUNDS.h / 2;

export function toScene(x: number, y: number): [number, number, number] {
  return [x - ORIGIN_X, 0, y - ORIGIN_Y];
}

function center(rect: Rect): [number, number] {
  const [x, , z] = toScene(rect.x + rect.w / 2, rect.y + rect.h / 2);
  return [x, z];
}

function Box({
  rect,
  height,
  y = 0,
  color,
  opacity,
  emissive,
}: {
  rect: Rect;
  height: number;
  y?: number;
  color: string;
  opacity?: number;
  emissive?: string;
}) {
  const [x, z] = center(rect);
  return (
    <mesh position={[x, y + height / 2, z]}>
      <boxGeometry args={[rect.w, height, rect.h]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.35 : 0}
      />
    </mesh>
  );
}

function FloorPlane({ rect, color, y = 0.5 }: { rect: Rect; color: string; y?: number }) {
  const [x, z] = center(rect);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[rect.w, rect.h]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function FloorLabel({ text, x, y, size = 13 }: { text: string; x: number; y: number; size?: number }) {
  const [sx, , sz] = toScene(x, y);
  return (
    <Suspense fallback={null}>
    <Text
      position={[sx, 1.2, sz]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={size}
      color="#ffffff"
      fillOpacity={0.55}
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
    </Suspense>
  );
}

function SmallLabel({ text, x, y, height }: { text: string; x: number; y: number; height: number }) {
  const [sx, , sz] = toScene(x, y);
  return (
    <Billboard position={[sx, height, sz]}>
      <Suspense fallback={null}>
      <Text fontSize={7} color="#ffffff" outlineWidth={0.4} outlineColor="#000000" anchorX="center" anchorY="middle">
        {text}
      </Text>
      </Suspense>
    </Billboard>
  );
}

function FurnitureMesh({ item }: { item: Furniture }) {
  const r = item.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (item.kind) {
    case "bunkbed":
      return (
        <group>
          <Box rect={r} height={8} y={4} color="#cbd5e1" />
          <Box rect={{ x: r.x + 2, y: r.y + 2, w: 10, h: r.h - 4 }} height={3} y={12} color="#f8fafc" />
          <Box rect={r} height={8} y={32} color="#cbd5e1" />
          <Box rect={{ x: r.x + 2, y: r.y + 2, w: 10, h: r.h - 4 }} height={3} y={40} color="#f8fafc" />
          {[
            [r.x, r.y],
            [r.x + r.w - 3, r.y],
            [r.x, r.y + r.h - 3],
            [r.x + r.w - 3, r.y + r.h - 3],
          ].map(([px, py], i) => (
            <Box key={i} rect={{ x: px, y: py, w: 3, h: 3 }} height={46} color="#64748b" />
          ))}
        </group>
      );
    case "bigtable": {
      const chairs: Array<[number, number]> = [
        ...[128, 168, 210, 252].flatMap((x) => [
          [x, r.y - 10] as [number, number],
          [x, r.y + r.h + 10] as [number, number],
        ]),
        [r.x - 10, cy],
        [r.x + r.w + 10, cy],
      ];
      return (
        <group>
          <Box rect={r} height={4} y={18} color="#e2c9a0" />
          <Box rect={{ x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12 }} height={18} color="#7c5a3a" />
          {chairs.map(([x, y], i) => (
            <Box key={i} rect={{ x: x - 6, y: y - 6, w: 12, h: 12 }} height={12} color="#1f2937" />
          ))}
        </group>
      );
    }
    case "fridge":
      return (
        <group>
          <Box rect={r} height={44} color="#e5e7eb" />
          <SmallLabel text={item.label ?? ""} x={cx} y={cy} height={54} />
        </group>
      );
    case "freezer":
      return (
        <group>
          <Box rect={r} height={26} color="#bae6fd" />
          <SmallLabel text={item.label ?? ""} x={cx} y={cy} height={36} />
        </group>
      );
    case "coffee":
      return (
        <group>
          <Box rect={r} height={16} color="#78350f" />
          <Box rect={{ x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }} height={10} y={16} color="#111827" />
          <SmallLabel text={item.label ?? ""} x={cx} y={cy} height={36} />
        </group>
      );
    case "counter":
      return <Box rect={r} height={20} color="#b08968" />;
    case "desk":
      return (
        <group>
          <Box rect={r} height={18} color="#d6d3d1" />
          <Box rect={{ x: cx - 8, y: r.y + 2, w: 16, h: 3 }} height={12} y={18} color="#111827" emissive="#38bdf8" />
          {item.label && <SmallLabel text={item.label} x={cx} y={cy} height={40} />}
        </group>
      );
    case "board":
      return (
        <group>
          <Box rect={r} height={30} y={10} color="#f8fafc" />
          <SmallLabel text={item.label ?? ""} x={cx + 10} y={cy} height={48} />
        </group>
      );
    case "tv":
      return (
        <group>
          <Box rect={{ x: cx - 2, y: cy - 2, w: 4, h: 4 }} height={22} color="#334155" />
          <Box rect={r} height={24} y={22} color="#0f172a" emissive="#1d4ed8" />
          <SmallLabel text="TV MEETING" x={cx} y={cy} height={56} />
        </group>
      );
    case "bed":
      return (
        <group>
          <Box rect={r} height={14} color="#e7e5e4" />
          <Box rect={{ x: r.x + r.w - 16, y: r.y + 6, w: 12, h: r.h - 12 }} height={4} y={14} color="#f8fafc" />
          <Box rect={{ x: r.x, y: r.y, w: r.w - 20, h: r.h }} height={3} y={14} color="#b45309" />
        </group>
      );
    case "car":
      return (
        <group>
          <Box rect={r} height={22} y={6} color="#1d4ed8" />
          <Box rect={{ x: r.x + 40, y: r.y + 8, w: r.w - 80, h: r.h - 16 }} height={18} y={28} color="#93c5fd" opacity={0.85} />
        </group>
      );
    case "crate":
      return (
        <group>
          <Box rect={r} height={34} color="#a16207" />
          {item.label && <SmallLabel text={item.label} x={cx} y={cy} height={46} />}
        </group>
      );
    case "rack":
      return (
        <group>
          {[0, 16, 32].map((y) => (
            <Box key={y} rect={r} height={3} y={y + 6} color="#94a3b8" />
          ))}
          <Box rect={{ x: r.x + 10, y: r.y + 10, w: 24, h: 20 }} height={10} y={9} color="#a16207" />
          <Box rect={{ x: r.x + 50, y: r.y + 20, w: 30, h: 24 }} height={10} y={25} color="#475569" />
        </group>
      );
    case "picnictable":
      // Meja piknik khas: papan meja di tengah + bangku menempel di kedua
      // sisi panjang (beda dari "bigtable" yang kursinya lepas-lepas di
      // sekeliling) -- referensi suasana piknik Halaman Depan.
      return (
        <group>
          <Box rect={r} height={3} y={18} color="#8b5e34" />
          <Box rect={{ x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12 }} height={16} color="#5c3b1e" />
          <Box rect={{ x: r.x - 12, y: r.y + 3, w: 10, h: r.h - 6 }} height={9} y={2} color="#6b4226" />
          <Box rect={{ x: r.x + r.w + 2, y: r.y + 3, w: 10, h: r.h - 6 }} height={9} y={2} color="#6b4226" />
          {item.label && <SmallLabel text={item.label} x={cx} y={cy} height={32} />}
        </group>
      );
    case "bench":
      return <Box rect={r} height={10} y={2} color="#6b4226" />;
    case "bonfire": {
      // Lingkaran batu + kayu bakar silang + nyala api (cone emissive) +
      // cahaya titik supaya terasa hangat di malam hari -- satu-satunya
      // perabot yang pakai geometri non-kotak di scene ini, sengaja,
      // karena bentuknya memang bundar.
      const [sx, , sz] = toScene(cx, cy);
      const radius = Math.min(r.w, r.h) / 2;
      return (
        <group>
          <group position={[sx, 0, sz]}>
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(angle) * radius, 3, Math.sin(angle) * radius]}>
                  <sphereGeometry args={[4, 6, 6]} />
                  <meshStandardMaterial color="#57534e" />
                </mesh>
              );
            })}
            <mesh position={[0, 5, 0]} rotation={[0, Math.PI / 5, Math.PI / 2.2]}>
              <cylinderGeometry args={[2.2, 2.2, radius * 1.4, 8]} />
              <meshStandardMaterial color="#78350f" />
            </mesh>
            <mesh position={[0, 5, 0]} rotation={[0, -Math.PI / 4, Math.PI / 2.4]}>
              <cylinderGeometry args={[2.2, 2.2, radius * 1.4, 8]} />
              <meshStandardMaterial color="#5c3b1e" />
            </mesh>
            <mesh position={[0, 10, 0]}>
              <coneGeometry args={[radius * 0.55, 18, 8]} />
              <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.1} />
            </mesh>
            <mesh position={[0, 7, 0]}>
              <coneGeometry args={[radius * 0.4, 12, 8]} />
              <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.3} />
            </mesh>
            <pointLight position={[0, 16, 0]} color="#f97316" intensity={5} distance={150} decay={2} />
          </group>
          {item.label && <SmallLabel text={item.label} x={cx} y={cy} height={30} />}
        </group>
      );
    }
    default:
      return null;
  }
}

function Stairs() {
  const tangga = getRoom("tangga").rect;
  const steps = 8;
  const stepDepth = tangga.h / steps;
  return (
    <group>
      {Array.from({ length: steps }, (_, i) => (
        <Box
          key={i}
          rect={{ x: tangga.x + 4, y: tangga.y + tangga.h - (i + 1) * stepDepth, w: tangga.w - 8, h: stepDepth }}
          height={4 + i * 5}
          color={i % 2 ? "#a8a29e" : "#d6d3d1"}
        />
      ))}
      <SmallLabel text="TANGGA ↑ GUDANG" x={tangga.x + tangga.w / 2} y={tangga.y + 30} height={70} />
    </group>
  );
}

function Floor2() {
  const z = STAIRS_DOWN_ZONE;
  return (
    <group>
      <FloorPlane rect={{ x: FLOOR2_BOUNDS.x - 40, y: FLOOR2_BOUNDS.y - 40, w: FLOOR2_BOUNDS.w + 80, h: FLOOR2_BOUNDS.h + 80 }} color="#0b1120" y={-1} />
      <FloorPlane rect={FLOOR2_BOUNDS} color={getRoom("gudang").floor} />
      {[
        { x: FLOOR2_BOUNDS.x, y: FLOOR2_BOUNDS.y - 4, w: FLOOR2_BOUNDS.w, h: 8 },
        { x: FLOOR2_BOUNDS.x, y: FLOOR2_BOUNDS.y + FLOOR2_BOUNDS.h - 4, w: FLOOR2_BOUNDS.w, h: 8 },
        { x: FLOOR2_BOUNDS.x - 4, y: FLOOR2_BOUNDS.y, w: 8, h: FLOOR2_BOUNDS.h },
        { x: FLOOR2_BOUNDS.x + FLOOR2_BOUNDS.w - 4, y: FLOOR2_BOUNDS.y, w: 8, h: FLOOR2_BOUNDS.h },
      ].map((w, i) => (
        <Box key={i} rect={w} height={WALL_HEIGHT} color="#d6d3d1" />
      ))}
      <Box rect={z} height={3} color="#d6d3d1" />
      <SmallLabel text="TANGGA ↓ TURUN" x={z.x + z.w / 2} y={z.y + z.h / 2} height={30} />
      <FloorLabel text="GUDANG ALAT & BARANG · LT. 2" x={FLOOR2_BOUNDS.x + 390} y={FLOOR2_BOUNDS.y + 30} size={16} />
    </group>
  );
}

export function HouseScene({ ownerDoorOpen }: { ownerDoorOpen: boolean }) {
  const g = GROUND_BOUNDS;
  return (
    <group>
      {/* Tanah & taman di sekitar rumah */}
      <FloorPlane rect={{ x: g.x - 160, y: g.y - 160, w: g.w + 320, h: g.h + 320 }} color="#14532d" y={-1} />
      {ROOMS.filter((r) => r.id === "belakang" || r.id === "halamandepan").map((r) => (
        <FloorPlane key={r.id} rect={r.rect} color={r.floor} y={0} />
      ))}
      {/* Jalan setapak gerbang -> pintu utama */}
      <FloorPlane rect={{ x: 420, y: 880, w: 60, h: 108 }} color="#a8a29e" y={0.4} />

      {ROOMS.filter((r) => r.id !== "belakang" && r.id !== "halamandepan" && r.id !== "gudang").map((r) => (
        <FloorPlane key={r.id} rect={r.rect} color={r.floor} />
      ))}
      {ROOMS.filter((r) => r.showLabel && r.id !== "gudang").map((r) => (
        <FloorLabel key={r.id} text={r.label.toUpperCase()} x={r.rect.x + r.rect.w / 2} y={r.rect.y + 22} size={r.id === "it" ? 9 : 12} />
      ))}

      {/* Tembok rumah, bangunan belakang, pagar */}
      {WALLS.map((w, i) => (
        <Box key={`w${i}`} rect={w} height={WALL_HEIGHT} color="#e7e5e4" />
      ))}
      {OUTBUILDING_WALLS.map((w, i) => (
        <Box key={`o${i}`} rect={w} height={34} color="#d6d3d1" />
      ))}
      {FENCE.map((w, i) => (
        <Box key={`f${i}`} rect={w} height={16} color="#3f6212" />
      ))}
      {/* Tiang gerbang */}
      <Box rect={{ x: 382, y: 982, w: 10, h: 12 }} height={34} color="#57534e" />
      <Box rect={{ x: 508, y: 982, w: 10, h: 12 }} height={34} color="#57534e" />
      <SmallLabel text="GERBANG" x={450} y={988} height={46} />

      {/* Jendela kiri-kanan pintu utama */}
      {WINDOWS.map((w, i) => (
        <Box key={`win${i}`} rect={{ x: w.x, y: w.y - 1, w: w.w, h: w.h + 2 }} height={20} y={14} color="#7dd3fc" opacity={0.75} emissive="#0ea5e9" />
      ))}

      {/* Pintu Kamar Owner: tertutup untuk semua kecuali pemiliknya */}
      {!ownerDoorOpen && <Box rect={OWNER_DOOR} height={WALL_HEIGHT - 6} color="#92400e" />}

      {FURNITURE.map((item) => (
        <FurnitureMesh key={item.id} item={item} />
      ))}

      {/* Pajangan lorong tengah */}
      {ARTWORKS.map((a) => (
        <group key={a.id}>
          <Box rect={{ x: a.x - 2, y: a.y - 16, w: 4, h: 32 }} height={22} y={14} color={a.color} emissive={a.color} />
          <SmallLabel text={a.label} x={a.wall === "left" ? a.x + 18 : a.x - 22} y={a.y} height={44} />
        </group>
      ))}
      {SIGNS.map((s) => (
        <SmallLabel key={s.id} text={s.text} x={s.x} y={s.y} height={24} />
      ))}

      <Stairs />
      <Floor2 />
    </group>
  );
}
