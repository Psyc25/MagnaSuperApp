"use client";

import type { AIAgent } from "@/lib/ai/agents";
import type { AvatarLook } from "@/lib/virtual-office/avatar-look";
import type { Dir, Pos, RemotePos } from "@/lib/virtual-office/house";
import { ACTION_ANIM_MS, STATUS_COLORS, type AvatarActionKind, type PresenceStatus } from "@/lib/virtual-office/presence";
import { chunkyCircle, chunkyRect, outlinedText, roundRectPath } from "./draw2d";

// Re-export supaya kode lama yang mengimpor Dir/RemotePos dari "./Avatars"
// (bukan langsung dari house.ts) tidak perlu diubah.
export type { Dir, RemotePos };

/** Satu aksi gestur yang sedang/baru dipicu -- `at` dibandingkan ke
 * `Date.now()` tiap frame di drawAvatar, jadi animasinya berhenti sendiri
 * setelah ACTION_ANIM_MS tanpa perlu effect/timeout terpisah. */
export type AvatarAction = { kind: AvatarActionKind; at: number };

const DIR_VECTOR: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Posisi mata & hidung per arah hadap -- top-down, jadi wajah cuma
 * digeser ke sisi yang dituju (bukan rotasi sprite penuh). */
const FACE_OFFSETS: Record<Dir, { eyeL: [number, number]; eyeR: [number, number]; nose: [number, number] }> = {
  up: { eyeL: [-3, -3], eyeR: [3, -3], nose: [0, -5] },
  down: { eyeL: [-3, 2], eyeR: [3, 2], nose: [0, 5] },
  left: { eyeL: [-4, -1], eyeR: [-4, 3], nose: [-6, 1] },
  right: { eyeL: [4, -1], eyeR: [4, 3], nose: [6, 1] },
};

/** Posisi berpindah per frame (lerp) dari avatar rekan lain -- langsung
 * loncat kalau jaraknya jauh (pindah lantai lewat tangga = teleport,
 * bukan meluncur melintasi peta). Pengganti THREE.Vector3.lerp. */
export function lerpTowards(current: Pos, target: Pos, t: number, teleportDistance = 300): Pos {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.hypot(dx, dy) > teleportDistance) return { ...target };
  return { x: current.x + dx * t, y: current.y + dy * t };
}

/** Hash string sederhana (FNV-1a) -- dipakai bikin "seed" idle bob & kedip
 * per avatar dari label namanya, supaya tiap orang punya fase gerak beda
 * (nggak bernapas/kedip bareng-bareng persis) tanpa perlu nyimpen state
 * tambahan apa pun -- drawAvatar tetap murni/stateless, cuma fungsi dari
 * (now, label). Dipakai juga di drawSleepingBody utk fase napas selimut. */
function seedFromLabel(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i += 1) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000;
}

const BUBBLE_FONT = `700 10px ui-sans-serif, system-ui, sans-serif`;
const BUBBLE_MAX_WIDTH = 150;
const BUBBLE_MAX_LINES = 4;

/**
 * Word-wrap chat bubble (permintaan Owner: "lebih nyata", terinspirasi
 * video referensi -- bubble sekarang bisa nampung obrolan pendek, bukan
 * cuma reaksi 1-2 kata seperti sebelumnya). Beda dari helper teks biasa
 * (outlinedText) yang cuma gambar satu baris -- ini juga UKUR lebar tiap
 * baris (pakai font yang SAMA persis dengan yang dipakai gambar) supaya
 * bubble-nya pas, bukan kelebaran/kesempitan. Kata tunggal yang sendirian
 * lebih lebar dari maxWidth dipaksa dipecah per-karakter (jarang terjadi
 * utk Bahasa Indonesia yang biasa ada spasi, tapi dijaga biar tidak
 * meluber keluar bubble). Baris yang kepotong karena nabrak BUBBLE_MAX_LINES
 * diberi "…" di akhir.
 */
function layoutBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): { lines: string[]; width: number } {
  ctx.save();
  ctx.font = BUBBLE_FONT;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let chunk = "";
      for (const ch of word) {
        if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
      continue;
    }
    const attempt = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(attempt).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);

  let truncated = false;
  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }

  const width = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);
  ctx.restore();
  return { lines, width };
}

function drawHair(ctx: CanvasRenderingContext2D, x: number, y: number, look: AvatarLook): void {
  switch (look.hairStyle) {
    case "botak":
      return;
    case "pendek":
      chunkyRect(ctx, x - 9, y - 9, 18, 7, look.hair, { shadow: false, radius: 5 });
      return;
    case "panjang":
      chunkyRect(ctx, x - 9, y - 9, 18, 7, look.hair, { shadow: false, radius: 5 });
      chunkyRect(ctx, x - 10, y - 2, 20, 10, look.hair, { shadow: false, radius: 3 });
      return;
    case "topi":
      chunkyRect(ctx, x - 10, y - 11, 20, 8, look.hair, { shadow: false, radius: 4 });
      chunkyRect(ctx, x - 6, y - 5, 18, 3, look.hair, { shadow: false, radius: 1.5 });
      return;
    case "hijab":
      // Kain penuh menutup kepala+bahu -- cukup utk gaya chibi top-down,
      // tidak perlu bukaan depan presisi seperti versi 3D.
      chunkyCircle(ctx, x, y - 3, 12, look.hair, { shadow: false });
      chunkyRect(ctx, x - 11, y + 2, 22, 10, look.hair, { shadow: false, radius: 4 });
      return;
    default:
      return;
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, x: number, y: number, look: AvatarLook): void {
  if (look.accessory === "kacamata") {
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x - 3, y + 1, 2.6, 0, Math.PI * 2);
    ctx.arc(x + 3, y + 1, 2.6, 0, Math.PI * 2);
    ctx.moveTo(x - 0.6, y + 1);
    ctx.lineTo(x + 0.6, y + 1);
    ctx.stroke();
    ctx.restore();
  } else if (look.accessory === "headphone") {
    chunkyRect(ctx, x - 11, y - 10, 3, 7, "#374151", { shadow: false, radius: 1.5 });
    chunkyRect(ctx, x + 8, y - 10, 3, 7, "#374151", { shadow: false, radius: 1.5 });
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 9, 10, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSleepingBody(ctx: CanvasRenderingContext2D, x: number, y: number, look: AvatarLook, now: number, seed: number): void {
  // Kepala di sisi kiri (bantal), badan+selimut memanjang ke kanan.
  // Selimut "naik-turun" pelan (napas tidur) -- amplitudo kecil, fase
  // beda tiap orang (seed dari nama) sama seperti idle bob avatar bangun.
  const breathe = Math.sin(now / 1100 + seed) * 1;
  chunkyRect(ctx, x - 16, y - 4 - breathe, 32, 14 + breathe, look.pants, { shadow: false, radius: 6, opacity: 0.92 });
  chunkyCircle(ctx, x - 18, y + 2, 8, look.skin, { shadow: false });
  drawHair(ctx, x - 18, y + 2, look);
  ctx.save();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 21, y + 2);
  ctx.lineTo(x - 17, y + 2);
  ctx.moveTo(x - 15, y + 2);
  ctx.lineTo(x - 11, y + 2);
  ctx.stroke();
  ctx.restore();
}

function drawStandingBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: Dir,
  look: AvatarLook,
  action: AvatarAction | null | undefined,
  walkPhase: number,
  status: PresenceStatus | null | undefined,
  now: number,
  moving: boolean,
  seed: number,
  urgent: boolean | undefined
): void {
  // Idle bob (napas halus) -- cuma aktif saat BERDIRI DIAM (termasuk pas
  // lagi duduk/kerja/dll, karena interaksi juga bikin `moving` false),
  // amplitudo kecil supaya nggak numpuk sama walk-bob kaki yang sudah ada.
  // `y` parameter digeser di sini (bukan rename variabel) supaya semua
  // gambar badan di bawah otomatis ikut terangkat tanpa perlu diubah satu-
  // satu -- parameter function boleh ditulis ulang di JS/TS.
  if (!moving) y -= Math.sin(now / 650 + seed) * 1.3;

  const face = DIR_VECTOR[dir];
  const legLift = Math.sin(walkPhase) * 3;

  // Kaki -- bergantian naik-turun saat jalan (pengganti walk-bob 3D).
  chunkyRect(ctx, x - 7, y + 2 - Math.max(0, legLift), 5, 9, look.pants, { shadow: false, radius: 2 });
  chunkyRect(ctx, x + 2, y + 2 + Math.max(0, -legLift), 5, 9, look.pants, { shadow: false, radius: 2 });

  // Gestur lengan (tonjok/tos/lambai) -- envelope 0->1->0 selama
  // ACTION_ANIM_MS, sama konsepnya dengan versi R3F sebelumnya, cuma
  // sekarang menggeser posisi lingkaran lengan, bukan rotasi mesh.
  const elapsed = action ? Date.now() - action.at : Infinity;
  const active = Boolean(action) && elapsed >= 0 && elapsed < ACTION_ANIM_MS;
  const t = active ? elapsed / ACTION_ANIM_MS : 0;
  const envelope = active ? Math.sin(t * Math.PI) : 0;

  let leftArm = { x: 0, y: 0 };
  let rightArm = { x: 0, y: 0 };
  if (active && action) {
    switch (action.kind) {
      case "tonjok":
        rightArm = { x: face.x * envelope * 10, y: face.y * envelope * 10 };
        break;
      case "tos":
        rightArm = { x: 3 * envelope, y: -6 * envelope };
        leftArm = { x: -3 * envelope, y: -6 * envelope };
        break;
      case "lambai":
        rightArm = { x: Math.sin(t * Math.PI * 5) * 4, y: -7 * envelope };
        break;
      default:
        break;
    }
  }

  chunkyCircle(ctx, x - 10 + leftArm.x, y - 2 + leftArm.y, 4, look.shirt, { shadow: false });
  chunkyCircle(ctx, x + 10 + rightArm.x, y - 2 + rightArm.y, 4, look.shirt, { shadow: false });

  chunkyRect(ctx, x - 9, y - 12, 18, 16, look.shirt, { radius: 5, shadow: false });
  chunkyCircle(ctx, x, y - 20, 9, look.skin, { shadow: false });
  drawHair(ctx, x, y - 20, look);

  const fo = FACE_OFFSETS[dir];
  // Kedip sesekali -- durasi tiap siklus & titik mulainya beda per avatar
  // (seed dari nama) biar nggak semua orang kedip bersamaan persis.
  const blinkPeriod = 3200 + (seed % 1800);
  const blinking = (now + seed * 37) % blinkPeriod < 110;
  ctx.save();
  ctx.fillStyle = "#1f2937";
  if (blinking) {
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x + fo.eyeL[0] - 1.2, y - 20 + fo.eyeL[1]);
    ctx.lineTo(x + fo.eyeL[0] + 1.2, y - 20 + fo.eyeL[1]);
    ctx.moveTo(x + fo.eyeR[0] - 1.2, y - 20 + fo.eyeR[1]);
    ctx.lineTo(x + fo.eyeR[0] + 1.2, y - 20 + fo.eyeR[1]);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x + fo.eyeL[0], y - 20 + fo.eyeL[1], 1.1, 0, Math.PI * 2);
    ctx.arc(x + fo.eyeR[0], y - 20 + fo.eyeR[1], 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#b91c1c";
  ctx.beginPath();
  ctx.arc(x + fo.nose[0], y - 20 + fo.nose[1], 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawAccessory(ctx, x, y - 20, look);

  if (status) {
    chunkyCircle(ctx, x + 8, y - 27, 2.6, STATUS_COLORS[status], { shadow: false, glow: STATUS_COLORS[status] });
  }

  if (urgent) {
    // Berdenyut pelan biar kerasa "hidup"/butuh perhatian, bukan ikon
    // statis -- sisi KIRI kepala, berlawanan dari dot status di kanan.
    const pulse = 1 + Math.sin(now / 340) * 0.22;
    chunkyCircle(ctx, x - 8, y - 27, 3.4 * pulse, "#ef4444", { shadow: false, glow: "#ef4444" });
    outlinedText(ctx, "!", x - 8, y - 27, { size: 6.5, color: "#ffffff", stroke: false });
  }
}

export type AvatarDrawInput = {
  x: number;
  y: number;
  dir: Dir;
  look: AvatarLook;
  label: string;
  isSelf?: boolean;
  sleeping?: boolean;
  emote?: string | null;
  status?: PresenceStatus | null;
  action?: AvatarAction | null;
  /** Fase jalan (radian, naik terus selama bergerak) -- dihitung
   * pemanggil (loop di VirtualOfficeClient), bukan di sini, supaya fungsi
   * gambar ini tetap murni/stateless (tidak nyimpen state sendiri). */
  walkPhase?: number;
  /** Emoji kecil menandai pose interaksi perabot (duduk/kerja/dll) --
   * beda dari `emote` (chat bubble teks bebas, lihat presence.ts). */
  poseEmoji?: string | null;
  /** Jam loop gambar (`now` dari requestAnimationFrame/Date.now()) --
   * dipakai utk idle bob & kedip supaya avatar nggak beku total pas diam
   * (permintaan Owner: Kantor Virtual terasa kaku). */
  now: number;
  /** true kalau avatar sedang benar-benar berjalan -- idle bob/napas
   * dimatikan selama ini supaya nggak numpuk sama walk-bob kaki. */
  moving?: boolean;
  /** Badge "!" -- orang ini punya notifikasi PENTING yang belum dibaca
   * (lihat hasUrgentNotification di presence.ts, data ASLI dari
   * lib/notifications). Digambar di sisi kiri kepala, berdenyut pelan
   * (beda posisi dari dot status di sisi kanan supaya tidak tumpang
   * tindih kalau dua-duanya aktif bersamaan). */
  urgent?: boolean;
};

/** Gambar satu avatar chibi top-down -- dipanggil tiap frame dari loop di
 * VirtualOfficeClient utk avatar sendiri, rekan lain, orang yang "online
 * di tempat lain" (diam di meja), dan yang tidur di Kamar Staff. */
export function drawAvatar(ctx: CanvasRenderingContext2D, input: AvatarDrawInput): void {
  const { x, y, dir, look, label, isSelf, sleeping, emote, status, action, walkPhase = 0, poseEmoji, now, moving = false, urgent } = input;
  const seed = seedFromLabel(label);

  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + (sleeping ? 14 : 11), sleeping ? 20 : 11, sleeping ? 9 : 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (isSelf && !sleeping) {
    // Ring penanda diri sendiri "berdenyut" pelan -- bukan cuma dekorasi
    // statis, selaras sama idle bob badan di bawahnya.
    const pulse = 1 + Math.sin(now / 480) * 0.18;
    ctx.save();
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2 * pulse;
    ctx.globalAlpha = 0.85 + Math.sin(now / 480) * 0.15;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 15, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (sleeping) drawSleepingBody(ctx, x, y, look, now, seed);
  else drawStandingBody(ctx, x, y, dir, look, action, walkPhase, status, now, moving, seed, urgent);

  if (poseEmoji && !sleeping) {
    outlinedText(ctx, poseEmoji, x, y - 36, { size: 13, stroke: false });
  }

  outlinedText(ctx, sleeping ? `${label} · zZ` : label, x, y - (sleeping ? 20 : 30), {
    size: sleeping ? 8 : 9,
    outline: isSelf ? "#7c3aed" : "rgba(0,0,0,0.75)",
    color: sleeping ? "#cbd5e1" : "#ffffff",
  });

  if (emote && !sleeping) {
    const { lines, width } = layoutBubble(ctx, emote, BUBBLE_MAX_WIDTH, BUBBLE_MAX_LINES);
    const w = width + 16;
    const lineH = 13;
    const h = lines.length * lineH + 8;
    const bx = x - w / 2;
    // Tumbuh ke ATAS kalau makin banyak baris (bukan ke bawah), jadi
    // ujung bawah bubble tetap nempel dekat kepala walau isinya panjang.
    const by = y - 50 - (lines.length - 1) * lineH;
    ctx.save();
    ctx.fillStyle = "rgba(15,23,42,0.88)";
    roundRectPath(ctx, bx, by, w, h, 8);
    ctx.fill();
    ctx.restore();
    lines.forEach((line, i) => {
      outlinedText(ctx, line, x, by + lineH / 2 + 4 + i * lineH, { size: 10, stroke: false });
    });
  }
}

const AGENT_COLORS: Record<string, string> = {
  nova: "#8b5cf6",
  reno: "#10b981",
  crea: "#ec4899",
  fabr: "#f59e0b",
  finn: "#0ea5e9",
};

/** Gambar satu NPC AI (robot melayang) -- `elapsedSeconds` dipakai utk
 * animasi melayang/berputar, pengganti useFrame(state.clock) versi R3F. */
export function drawAgentNPC(ctx: CanvasRenderingContext2D, agent: AIAgent, x: number, y: number, elapsedSeconds: number): void {
  const color = AGENT_COLORS[agent.id] ?? "#8b5cf6";
  const bob = Math.sin(elapsedSeconds * 2) * 2.5;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 17, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const by = y - 10 + bob;
  chunkyRect(ctx, x - 9, by - 2, 18, 13, "#374151", { shadow: false, radius: 3, glow: color });
  chunkyRect(ctx, x - 7, by, 14, 9, color, { shadow: false, radius: 2, opacity: 0.55, glow: color });
  chunkyCircle(ctx, x, by - 15, 9, color, { shadow: false, glow: color });
  chunkyCircle(ctx, x, by - 15, 3.5, color, { shadow: false, glow: color, opacity: 0.9 });

  outlinedText(ctx, `${agent.icon} ${agent.name}`, x, by - 28, { size: 9, outline: color });
}
