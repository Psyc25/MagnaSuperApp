"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  Armchair,
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
  Volume2,
  VolumeX,
  X as StopInteractIcon,
  Zap,
} from "lucide-react";
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
  FURNITURE,
  GROUND_BOUNDS,
  OWNER_DOOR_CENTER,
  OWNER_ROOM_USER_IDS,
  PLAYER_SPEED,
  ROOM_ACTIVITY_COLORS,
  ROOM_ACTIVITY_LABELS,
  ROOM_KIND_ICON,
  ROOMS,
  SPAWN,
  SPRINT_MULTIPLIER,
  blockersFor,
  canEnterOwnerRoom,
  chatRoomFor,
  deskForDivision,
  describeRoomActivity,
  getRoom,
  getRoomAt,
  isUpstairs,
  resolveMove,
  sleepSlot,
  stairsTeleport,
  type Furniture,
  type Pos,
  type RoomActivityState,
  type RoomHighlight,
  type RoomId,
} from "@/lib/virtual-office/house";
import { getAgentById, type AIAgent } from "@/lib/ai/agents";
import {
  ACTION_COOLDOWN_MS,
  EMOTE_MAX_LENGTH,
  emoteDurationFor,
  QUICK_ACTIONS,
  QUICK_EMOTES,
  STATUS_COLORS,
  STATUS_LABELS,
  type AvatarActionKind,
  type PresenceStatus,
} from "@/lib/virtual-office/presence";
import { applyCameraTransform, drawFurnitureItem, drawGround, drawInteractHint, DEFAULT_CAMERA_SCALE, type Camera } from "./HouseScene";
import { drawAgentNPC, drawAvatar, lerpTowards, type AvatarAction, type Dir, type RemotePos } from "./Avatars";
import { ActivityFeed } from "./ActivityFeed";
import { isAudioMuted, playAction, playEmote, playFootstep, playInteractToggle, playNotify, setAudioMuted } from "@/lib/virtual-office/sfx";
import {
  findNearestInteractable,
  furnitureById,
  interactionStandPoint,
  INTERACTION_BY_KIND,
  INTERACTION_POSE_LABEL,
  MOMENTARY_INTERACTION_MS,
  type InteractableNearby,
  type InteractionConfig,
  type InteractionKind,
} from "@/lib/virtual-office/interactions";
import { CharacterEditor } from "./CharacterEditor";
import { useVirtualOfficePresence } from "./PresenceProvider";

/**
 * Kantor Virtual v5 -- "Rumah Magna" (denah & aturan di
 * src/lib/virtual-office/house.ts). Render 2D Canvas (rewrite Oktober
 * 2026 dari react-three-fiber, permintaan Owner: "diubah seperti gambar
 * referensi, dibuat interaktif seperti game"). Rekan yang sedang membuka
 * aplikasi tampil online dan berjalan di rumah; yang tidak membuka
 * aplikasi tidur di kasurnya di Kamar Staff. Tiap orang bisa mengubah
 * karakternya sendiri, dan sekarang juga bisa memakai hampir semua
 * perabot (duduk/kerja/masak/nonton/menghangatkan diri -- lihat
 * interactions.ts) yang langsung terlihat di avatar rekan lain juga.
 */

const BROADCAST_INTERVAL_MS = 70;
const INTERACTION_RADIUS = 55;
// Seberapa sering status "aktivitas kantor" per ruangan dihitung ulang
// (siapa ada di mana + status mereka) -- jauh lebih jarang dari posisi
// (BROADCAST_INTERVAL_MS) karena ini cuma buat ringkasan di pill
// ruangan & Activity Feed, bukan animasi, jadi tidak perlu presisi
// frame-rate (permintaan Owner, Okt 2026: "room punya state yang jelas").
const OFFICE_SNAPSHOT_INTERVAL_MS = 2000;
/** Prioritas tampil kalau ada beberapa ruangan ramai bersamaan -- yang
 * paling butuh perhatian ditaruh paling atas (lihat computeOfficeSnapshot). */
const ROOM_ACTIVITY_PRIORITY: Record<RoomActivityState, number> = { sepi: 0, aktif: 1, meeting: 2, urgent: 3 };

/** Emoji kecil di atas kepala avatar saat memakai perabot -- lihat
 * InteractionKind di interactions.ts. */
const POSE_EMOJI: Record<InteractionKind, string> = {
  duduk: "\u{1FA91}",
  tidur: "\u{1F634}",
  kerja: "\u{1F4BB}",
  masak: "☕",
  lihat: "\u{1F440}",
  nonton: "\u{1F4FA}",
  hangat: "\u{1F525}",
};

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

/** Tampilan rekan lain -- utamakan presence live (bisa beda dari data
 * roster kalau orangnya baru ganti karakter) sama seperti sebelumnya. */
function resolveLook(entry: OfficeRosterEntry, presenceMeta: Map<string, { look: AvatarLook }>): AvatarLook {
  return presenceMeta.get(entry.id)?.look ?? entry.look;
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

  const {
    onlineIds,
    presenceMeta,
    remoteRef,
    remoteEmoteRef,
    remoteActionRef,
    remoteInteractRef,
    broadcastMove,
    broadcastEmote,
    broadcastAction,
    broadcastInteract,
    myStatus,
    myUrgent,
    updatePresence,
  } = useVirtualOfficePresence();

  const posRef = useRef<Pos>({ ...SPAWN });
  const dirRef = useRef<Dir>("up");
  // Timestamp (Date.now(), sama epoch dgn `now` loop gambar) terakhir
  // kali `dirRef` BERUBAH -- beda dari dirRef sendiri (cuma simpan arah
  // SEKARANG) -- dipakai drawAvatar (lihat turnAt/turnPopEnvelope di
  // Avatars.tsx) memicu animasi "pop" singkat (squash/stretch + lean
  // badan) tiap belok, bukan tiap mulai jalan (gap laporan Oktober 2026:
  // "belum ada squash/stretch atau lean badan saat belok"). Diupdate di
  // step() tiap kali arah baru beda dari dirRef.current sebelum ditimpa.
  const turnAtRef = useRef(0);
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
  // Aksi gestur (tonjok/tos/lambai, Opsi B gap Oktober 2026) -- beda dari
  // emote: ini menggerakkan lengan avatar sungguhan (lihat drawAvatar di
  // Avatars.tsx), bukan cuma bubble di atas kepala. `lastActionAtRef`
  // dipakai buat cooldown (ACTION_COOLDOWN_MS) supaya tombolnya tidak bisa
  // dispam -- disimpan di ref (bukan cuma dicek dari state) supaya klik
  // beruntun yang terjadi sebelum re-render pun tetap kena cooldown.
  const [myAction, setMyAction] = useState<AvatarAction | null>(null);
  const lastActionAtRef = useRef(0);
  const [actionOnCooldown, setActionOnCooldown] = useState(false);
  const actionCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Ringkasan "keadaan kantor" (siapa ramai di mana, ruangan mana sedang
  // meeting/perlu perhatian) -- dihitung periodik (lihat
  // OFFICE_SNAPSHOT_INTERVAL_MS), dibaca pill ruangan di header DAN
  // diteruskan ke ActivityFeed biar feed-nya nyambung ke kondisi kantor
  // beneran, bukan cuma daftar notifikasi generik (permintaan Owner,
  // Okt 2026: "activity feed harus menceritakan keadaan kantor").
  const [myRoomActivity, setMyRoomActivity] = useState<RoomActivityState>("sepi");
  const [roomHighlights, setRoomHighlights] = useState<RoomHighlight[]>([]);
  const lastSnapshotAtRef = useRef(0);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNearbyIdRef = useRef<string | null>(null);

  // Helper toast umum (permintaan Owner: "setelah user klik/melakukan
  // aksi, user harus tahu hasilnya") -- dipakai di beberapa tempat
  // (dekat rekan, ganti status, mulai/berhenti interaksi) supaya semua
  // aksi dapat feedback singkat yang konsisten, bukan cuma yang
  // "mendekat" yang sudah ada sebelumnya.
  const showToast = useCallback((message: string, ms = 2200) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), ms);
  }, []);

  // Interaksi perabot (Opsi B, laporan gap Oktober 2026: "semua perabot
  // bisa dipakai, bukan cuma dekorasi"). myInteractionRef = sumber
  // kebenaran yang dibaca loop gambar tiap frame (lihat efek canvas di
  // bawah); state `myInteraction` cuma utk menggambar tombol UI-nya.
  // approachPos = posisi avatar PAS mulai interaksi (snapshot sekali,
  // bukan dihitung ulang tiap frame) -- dipakai interactionStandPoint
  // buat milih tepi perabot mana yang paling masuk akal (dekat avatar
  // berdiri sekarang), bukan selalu tepi bawah. Lihat komentar
  // interactionStandPoint di interactions.ts.
  const myInteractionRef = useRef<{ furnitureId: string; kind: InteractionKind; approachPos: Pos } | null>(null);
  const interactionStartRef = useRef(0);
  const [myInteraction, setMyInteraction] = useState<{ furnitureId: string; kind: InteractionKind; approachPos: Pos } | null>(null);
  const [nearestInteractable, setNearestInteractable] = useState<InteractableNearby | null>(null);
  // Dibaca tiap frame oleh draw() buat gambar highlight in-world (lihat
  // drawInteractHint di HouseScene) -- terpisah dari state React di atas
  // yang cuma dipakai utk tombol UI, biar tidak perlu nunggu re-render.
  const nearestInteractableRef = useRef<InteractableNearby | null>(null);

  const startInteraction = useCallback(
    (item: Furniture, config: InteractionConfig) => {
      const next = { furnitureId: item.id, kind: config.kind, approachPos: { ...posRef.current } };
      myInteractionRef.current = next;
      interactionStartRef.current = Date.now();
      setMyInteraction(next);
      broadcastInteract(item.id);
      playInteractToggle(true);
      showToast(config.verb(item.label ?? ""));
    },
    [broadcastInteract, showToast]
  );

  const stopInteraction = useCallback(() => {
    // Sengaja TANPA toast di sini (beda dari startInteraction) --
    // stopInteraction juga otomatis terpanggil tiap kali pemain mulai
    // jalan (lihat step() di bawah: "trying && myInteractionRef.current
    // -> stopInteraction()"), jadi toast di sini bakal muncul tiap
    // langkah pertama setelah duduk/kerja -- berisik, bukan feedback
    // yang berguna. Berhentinya sudah kelihatan sendiri dari pose avatar
    // & ikon interaksi yang hilang.
    myInteractionRef.current = null;
    setMyInteraction(null);
    broadcastInteract(null);
    playInteractToggle(false);
  }, [broadcastInteract]);

  // Canvas 2D (rewrite Oktober 2026 dari react-three-fiber) -- state
  // kamera & bantuan smoothing utk loop gambar di efek besar di bawah.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>({ x: SPAWN.x, y: SPAWN.y, scale: DEFAULT_CAMERA_SCALE });
  const cameraReadyRef = useRef(false);
  const cssSizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const walkPhaseRef = useRef(0);
  // Kecepatan jalan avatar SENDIRI, di-ease menuju target (0 saat diam,
  // PLAYER_SPEED/sprint saat tombol ditahan) -- bukan langsung full speed
  // (keluhan Owner: "kaku", mulai/berhenti jalan kerasa kayak robot).
  // `lastMoveDirRef` nyimpen arah normalized TERAKHIR yang ditekan,
  // dipakai buat tetap "meluncur" dikit ke arah itu sesaat setelah tombol
  // dilepas (selama currentSpeedRef belum habis), bukan berhenti seketika.
  const currentSpeedRef = useRef(0);
  const lastMoveDirRef = useRef({ x: 0, y: 1 });
  const smoothPosRef = useRef<Map<string, Pos>>(new Map());
  // Posisi rekan lain PAS mereka mulai interaksi -- snapshot sekali per
  // sesi interaksi (bukan dihitung ulang tiap frame), sama kayak
  // myInteractionRef.approachPos tapi versi rekan kerja. Dihapus lagi
  // begitu mereka berhenti interaksi (lihat loop render di bawah).
  const remoteApproachPosRef = useRef<Map<string, Pos>>(new Map());
  // Timestamp terakhir kali ARAH HADAP rekan lain berubah (per id) --
  // versi remote dari turnAtRef di atas, dibaca dari `dir` yang mereka
  // broadcast (bukan dihitung sendiri, beda dari currentSpeedRef yang
  // cuma ada utk avatar sendiri). Dipakai sama: trigger animasi pop
  // (squash/stretch + lean) avatar rekan lain pas mereka belok juga.
  const remoteTurnRef = useRef<Map<string, { dir: Dir; at: number }>>(new Map());
  // Posisi avatar sendiri yang DIGAMBAR (beda dari posRef.current yang
  // dipakai fisik/tabrakan/kamera) -- di-ease tiap frame ke arah target
  // (posisi jalan biasa, atau titik berdiri perabot pas interaksi) supaya
  // transisi masuk/keluar pose nggak "snap" instan (permintaan Owner:
  // Kantor Virtual terasa kaku). movingSelfRef dipakai drawAvatar utk
  // nentuin kapan idle bob/napas aktif.
  const selfRenderPosRef = useRef<Pos>({ x: SPAWN.x, y: SPAWN.y });
  const movingSelfRef = useRef(false);
  const lastBroadcastRef = useRef(0);
  const lastRoomRef = useRef<RoomId | undefined | null>(null);
  const lastNearbyRef = useRef<string | null>(null);
  const lastAgentRef = useRef<string | null>(null);
  const lastDoorRef = useRef(false);
  const lastInteractableIdRef = useRef<string | null>(null);
  const lastFootstepAtRef = useRef(0);

  // Toggle mute SFX -- dibaca dari localStorage (lihat sfx.ts), bukan
  // default true/false hardcode, biar preferensi sebelumnya kepakai lagi.
  // useEffect (bukan langsung di useState initial) supaya tidak beda
  // antara server/client render pertama (localStorage cuma ada di browser).
  const [audioMuted, setAudioMutedState] = useState(false);
  useEffect(() => {
    setAudioMutedState(isAudioMuted());
  }, []);

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
  // history -- hilang sendiri setelah durasi dari emoteDurationFor() (makin
  // panjang teksnya, makin lama bubble-nya nongol, maks ~11s).
  const sendEmote = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (myEmoteTimeoutRef.current) clearTimeout(myEmoteTimeoutRef.current);
      setMyEmote(trimmed);
      broadcastEmote(trimmed);
      playEmote();
      myEmoteTimeoutRef.current = setTimeout(() => setMyEmote(null), emoteDurationFor(trimmed));
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

  // Pemicu gestur tonjok/tos/lambai -- hanya jalan kalau ada rekan di
  // radius interaksi (`nearby`, dipakai juga oleh tombol Chat) dan tidak
  // sedang cooldown. Avatar sendiri langsung dianimasikan (tidak nunggu
  // round-trip broadcast), lalu disiarkan ke semua orang lain lewat
  // channel yang sama supaya kelihatan juga di avatarnya.
  const performAction = useCallback(
    (kind: AvatarActionKind) => {
      const now = Date.now();
      if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) return;
      lastActionAtRef.current = now;
      setMyAction({ kind, at: now });
      broadcastAction(kind);
      playAction(kind);
      setActionOnCooldown(true);
      if (actionCooldownTimeoutRef.current) clearTimeout(actionCooldownTimeoutRef.current);
      actionCooldownTimeoutRef.current = setTimeout(() => setActionOnCooldown(false), ACTION_COOLDOWN_MS);
    },
    [broadcastAction]
  );

  useEffect(() => {
    return () => {
      if (actionCooldownTimeoutRef.current) clearTimeout(actionCooldownTimeoutRef.current);
    };
  }, []);

  // Toast "X mendekat" -- numpang pada deteksi `nearby` yang sudah ada di
  // loop gambar (jarak terdekat ke rekan di peta), cuma muncul sekali per
  // transisi null->seseorang atau ganti orang, bukan tiap re-render.
  useEffect(() => {
    if (nearby) {
      if (nearby.id !== prevNearbyIdRef.current) {
        prevNearbyIdRef.current = nearby.id;
        showToast(`${firstName(nearby.fullName)} mendekat`, 3000);
        playNotify();
      }
    } else {
      prevNearbyIdRef.current = null;
    }
  }, [nearby, showToast]);

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

  // "Nilai hidup" yang berubah tiap render tapi dibaca dari dalam loop
  // requestAnimationFrame yang di-mount SEKALI (lihat efek canvas di
  // bawah) -- ditulis ulang langsung di body render (bukan di dalam
  // effect) supaya loop selalu baca nilai terbaru tanpa perlu restart
  // animasinya tiap kali ada state yang berubah (pola "latest ref").
  const liveRef = useRef({
    look,
    myEmote,
    myStatus,
    myAction,
    myUrgent,
    fullName: currentUser.fullName,
    rosterById,
    presenceMeta,
    blockers,
    isOwner,
    othersInOffice,
    othersElsewhere,
    sleepers,
  });
  liveRef.current = {
    look,
    myEmote,
    myStatus,
    myAction,
    myUrgent,
    fullName: currentUser.fullName,
    rosterById,
    presenceMeta,
    blockers,
    isOwner,
    othersInOffice,
    othersElsewhere,
    sleepers,
  };

  // Loop utama: gerak + tabrakan + broadcast posisi + deteksi ruangan/
  // rekan/NPC/pintu/perabot + kamera + gambar ulang canvas tiap frame.
  // Di-mount SEKALI (bukan tiap render, beda dari <GameLoop> versi R3F
  // sebelumnya yang re-render React biasa) -- nilai yang berubah dibaca
  // lewat refs/liveRef di atas, bukan lewat closure React normal.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Alias ber-tipe non-null -- TypeScript tidak mempertahankan hasil
    // narrowing `if (!x) return` di atas ke dalam closure fungsi bersarang
    // (resize/draw) di bawah, jadi dialihkan ke const baru yang tipenya
    // memang sudah non-null dari awal.
    const canvasEl: HTMLCanvasElement = canvas;
    const ctx2: CanvasRenderingContext2D = ctx;

    let raf = 0;
    let lastTime = performance.now();
    dprRef.current = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      cssSizeRef.current = { w, h };
      const targetW = Math.round(w * dprRef.current);
      const targetH = Math.round(h * dprRef.current);
      if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
        canvasEl.width = targetW;
        canvasEl.height = targetH;
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvasEl);

    function draw(now: number) {
      const { w, h } = cssSizeRef.current;
      if (w === 0 || h === 0) return;
      const live = liveRef.current;

      ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.fillStyle = "#05070d";
      ctx2.fillRect(0, 0, canvasEl.width, canvasEl.height);

      applyCameraTransform(ctx2, cameraRef.current, dprRef.current, w, h);
      drawGround(ctx2, now, { ownerDoorOpen: live.isOwner });

      type Sortable = { sortY: number; render: () => void };
      const items: Sortable[] = [];

      for (const f of FURNITURE) {
        items.push({ sortY: f.rect.y + f.rect.h, render: () => drawFurnitureItem(ctx2, f, now) });
      }

      const myInteract = myInteractionRef.current;
      const myItem = myInteract ? furnitureById(FURNITURE, myInteract.furnitureId) : null;
      const myTargetPos = myItem ? interactionStandPoint(myItem, myInteract?.approachPos) : posRef.current;
      // Pose badan ikut jenis interaksi -- bukan cuma dipindah posisi
      // sambil tetap berdiri (keluhan Owner: interaksi perabot kerasa
      // aneh). "tidur" pakai pose rebahan yang sudah ada (sama kayak
      // tidur pasif di Kamar Staff), "duduk"/"kerja" pakai kaki ditekuk.
      const mySleeping = myInteract?.kind === "tidur";
      const mySeated = myInteract?.kind === "duduk" || myInteract?.kind === "kerja";
      // Ease posisi GAMBAR ke arah target (bukan snap langsung) -- lihat
      // komentar selfRenderPosRef di atas. t lebih cepat dari smoothing
      // rekan lain (0.28 vs 0.22) karena ini avatar sendiri, harus terasa
      // responsif, cuma nggak instan-snap pas mulai/berhenti interaksi.
      const myDrawPos = lerpTowards(selfRenderPosRef.current, myTargetPos, 0.28);
      selfRenderPosRef.current = myDrawPos;
      items.push({
        sortY: myDrawPos.y,
        render: () =>
          drawAvatar(ctx2, {
            x: myDrawPos.x,
            y: myDrawPos.y,
            dir: dirRef.current,
            look: live.look,
            label: `${firstName(live.fullName)} (Kamu)`,
            isSelf: true,
            emote: live.myEmote,
            status: live.myStatus,
            action: live.myAction,
            urgent: live.myUrgent,
            sleeping: mySleeping,
            seated: mySeated,
            walkPhase: walkPhaseRef.current,
            poseEmoji: myInteract ? POSE_EMOJI[myInteract.kind] : null,
            now,
            moving: movingSelfRef.current,
            turnAt: turnAtRef.current,
          }),
      });

      for (const id of live.othersInOffice) {
        const entry = live.rosterById.get(id);
        if (!entry) continue;
        const target = remoteRef.current.get(id);
        const interactFurnitureId = remoteInteractRef.current.get(id) ?? null;
        const interactItem = interactFurnitureId ? furnitureById(FURNITURE, interactFurnitureId) : null;
        const prevSmoothed = smoothPosRef.current.get(id) ?? { x: target?.x ?? SPAWN.x, y: target?.y ?? SPAWN.y };
        // Target posisi gambar: titik berdiri perabot kalau sedang
        // interaksi, kalau nggak posisi broadcast terakhir -- dua-duanya
        // lewat lerpTowards yang sama (bukan snap keras lagi) supaya
        // masuk/keluar pose rekan lain juga keliatan meluncur halus, sama
        // seperti punya sendiri.
        let approachPos: Pos | undefined;
        if (interactItem) {
          approachPos = remoteApproachPosRef.current.get(id);
          if (!approachPos) {
            approachPos = { ...prevSmoothed };
            remoteApproachPosRef.current.set(id, approachPos);
          }
        } else {
          remoteApproachPosRef.current.delete(id);
        }
        const rawTarget = interactItem ? interactionStandPoint(interactItem, approachPos) : { x: target?.x ?? prevSmoothed.x, y: target?.y ?? prevSmoothed.y };
        const smoothed = lerpTowards(prevSmoothed, rawTarget, 0.22);
        smoothPosRef.current.set(id, smoothed);
        const movingRemote = !interactItem && Math.hypot(smoothed.x - prevSmoothed.x, smoothed.y - prevSmoothed.y) > 0.4;
        const drawPos = smoothed;
        const interactKind = interactItem ? INTERACTION_BY_KIND[interactItem.kind]?.kind ?? null : null;

        const e = remoteEmoteRef.current.get(id);
        const emoteText = e && now - e.at < emoteDurationFor(e.content) ? e.content : null;
        const a = remoteActionRef.current.get(id);
        const actionObj = a ? { kind: a.action, at: a.at } : null;

        // Sama logikanya dgn turnAtRef avatar sendiri di step(), cuma
        // sumber arahnya dari broadcast rekan (target?.dir), bukan
        // tombol yang kita tekan sendiri -- lihat komentar remoteTurnRef.
        const remoteDir = target?.dir ?? "down";
        const prevTurn = remoteTurnRef.current.get(id);
        if (!prevTurn) {
          // Pertama kali rekan ini muncul di frame -- simpan arahnya tanpa
          // memicu pop (at: 0, sama seperti turnAtRef avatar sendiri yang
          // mulai dari 0), supaya orang yang baru kelihatan nggak langsung
          // "pop" seolah baru belok.
          remoteTurnRef.current.set(id, { dir: remoteDir, at: 0 });
        } else if (prevTurn.dir !== remoteDir) {
          remoteTurnRef.current.set(id, { dir: remoteDir, at: now });
        }

        items.push({
          sortY: drawPos.y,
          render: () =>
            drawAvatar(ctx2, {
              x: drawPos.x,
              y: drawPos.y,
              dir: remoteDir,
              look: resolveLook(entry, live.presenceMeta),
              label: firstName(entry.fullName),
              status: live.presenceMeta.get(id)?.status,
              emote: emoteText,
              action: actionObj,
              urgent: live.presenceMeta.get(id)?.hasUrgentNotification,
              sleeping: interactKind === "tidur",
              seated: interactKind === "duduk" || interactKind === "kerja",
              poseEmoji: interactKind ? POSE_EMOJI[interactKind] : null,
              now,
              moving: movingRemote,
              turnAt: remoteTurnRef.current.get(id)?.at ?? null,
            }),
        });
      }

      for (const id of live.othersElsewhere) {
        const entry = live.rosterById.get(id);
        if (!entry) continue;
        const desk = deskForDivision(entry.division);
        items.push({
          sortY: desk.y,
          render: () =>
            drawAvatar(ctx2, {
              x: desk.x,
              y: desk.y,
              dir: "down",
              look: resolveLook(entry, live.presenceMeta),
              label: firstName(entry.fullName),
              status: live.presenceMeta.get(id)?.status,
              now,
            }),
        });
      }

      live.sleepers.forEach((entry, i) => {
        const slot = sleepSlot(i);
        if (!slot) return;
        items.push({
          sortY: slot.y,
          render: () =>
            drawAvatar(ctx2, {
              x: slot.x,
              y: slot.y,
              dir: "down",
              look: entry.look,
              label: firstName(entry.fullName),
              sleeping: true,
              now,
            }),
        });
      });

      for (const npc of AGENT_NPC_POSITIONS) {
        const agent = getAgentById(npc.agentId);
        if (!agent) continue;
        items.push({ sortY: npc.y, render: () => drawAgentNPC(ctx2, agent, npc.x, npc.y, now / 1000) });
      }

      items.sort((a, b) => a.sortY - b.sortY);
      for (const it of items) it.render();

      // Highlight in-world perabot terdekat yang bisa dipakai -- digambar
      // TERAKHIR (di atas avatar/perabot lain), cuma pas tidak sedang
      // interaksi apa pun (lihat nearestInteractableRef di step()).
      if (nearestInteractableRef.current) {
        const near = nearestInteractableRef.current;
        drawInteractHint(ctx2, near.furniture, POSE_EMOJI[near.config.kind], now);
      }

      ctx2.setTransform(1, 0, 0, 1, 0, 0);
    }

    function step(dt: number, now: number) {
      const live = liveRef.current;
      const keys = keysRef.current;
      let vx = 0;
      let vy = 0;
      if (keys.has("arrowup") || keys.has("w")) vy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vy += 1;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      const trying = vx !== 0 || vy !== 0;

      // Jalan = otomatis berhenti dari interaksi (toggle) -- pemain tidak
      // perlu klik tombol "Berhenti" dulu, sama seperti kebanyakan game.
      if (trying && myInteractionRef.current) stopInteraction();

      let teleported = false;
      let moving = false;
      const canWalk = !myInteractionRef.current;
      if (trying && canWalk) {
        const len = Math.hypot(vx, vy) || 1;
        lastMoveDirRef.current = { x: vx / len, y: vy / len };
        const nextDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
        // Catat timestamp HANYA pas arah hadap benar-benar berubah (bukan
        // tiap frame tombol ditahan) -- ini yang dibaca drawAvatar lewat
        // turnAt buat memicu animasi pop sekali per belokan, bukan nonstop
        // selama jalan ke arah yang sama (lihat komentar turnAtRef di atas).
        if (nextDir !== dirRef.current) turnAtRef.current = now;
        dirRef.current = nextDir;
      }
      // Ease kecepatan ke target (0 kalau diam/lagi interaksi, speed
      // penuh/sprint kalau tombol ditahan) -- bukan on/off instan, biar
      // mulai-jalan & berhenti kerasa akselerasi/deselerasi halus, bukan
      // "nempel-lepas" (lihat komentar currentSpeedRef di atas). Faktor
      // ease dibikin dari dt (bukan konstanta per-frame) supaya konsisten
      // di refresh rate berapa pun -- pola sama dengan smoothing kamera
      // di bawah, cuma time-constant-nya lebih singkat (~80ms) biar tetap
      // kerasa responsif buat gerakan sendiri, bukan lamban.
      const targetSpeed = trying && canWalk ? (keys.has("shift") ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED) : 0;
      const speedEase = 1 - Math.exp(-dt / 0.08);
      currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * speedEase;
      if (currentSpeedRef.current < 2) currentSpeedRef.current = 0;
      if (canWalk && currentSpeedRef.current > 0) {
        const dir = lastMoveDirRef.current;
        const next = resolveMove(posRef.current, dir.x * currentSpeedRef.current * dt, dir.y * currentSpeedRef.current * dt, live.blockers);
        moving = next.x !== posRef.current.x || next.y !== posRef.current.y;
        posRef.current = next;
        const tp = stairsTeleport(posRef.current);
        if (tp) {
          posRef.current = tp;
          teleported = true;
        }
      } else if (!canWalk) {
        currentSpeedRef.current = 0;
      }
      walkPhaseRef.current = moving ? walkPhaseRef.current + dt * 12 : 0;
      movingSelfRef.current = moving;

      // Langkah kaki -- cuma avatar sendiri (lihat komentar playFootstep),
      // interval dipercepat saat sprint biar tempo kedengaran sesuai.
      if (moving) {
        const footstepInterval = keys.has("shift") ? 190 : 300;
        if (now - lastFootstepAtRef.current > footstepInterval) {
          lastFootstepAtRef.current = now;
          playFootstep();
        }
      }

      if (teleported || now - lastBroadcastRef.current > BROADCAST_INTERVAL_MS) {
        lastBroadcastRef.current = now;
        broadcastMove(posRef.current.x, posRef.current.y, dirRef.current);
      }

      const { x, y } = posRef.current;
      const rid = getRoomAt(x, y)?.id;
      if (rid !== lastRoomRef.current) {
        lastRoomRef.current = rid;
        setRoomId(rid);
      }

      if (now - lastSnapshotAtRef.current > OFFICE_SNAPSHOT_INTERVAL_MS) {
        lastSnapshotAtRef.current = now;
        const counts = new Map<RoomId, number>();
        const meetingFlags = new Map<RoomId, boolean>();
        const urgentFlags = new Map<RoomId, boolean>();
        const tally = (p: Pos, status: string | null | undefined, urgent: boolean | undefined) => {
          const roomId2 = getRoomAt(p.x, p.y)?.id;
          if (!roomId2) return;
          counts.set(roomId2, (counts.get(roomId2) ?? 0) + 1);
          if (status === "meeting") meetingFlags.set(roomId2, true);
          if (urgent) urgentFlags.set(roomId2, true);
        };
        tally({ x, y }, live.myStatus, live.myUrgent);
        for (const id of live.othersInOffice) {
          const rp = remoteRef.current.get(id);
          if (!rp) continue;
          const meta = live.presenceMeta.get(id);
          tally(rp, meta?.status, meta?.hasUrgentNotification);
        }
        const highlights: RoomHighlight[] = [];
        for (const r of ROOMS) {
          const count = counts.get(r.id) ?? 0;
          if (count === 0) continue;
          const activity = describeRoomActivity(r.kind, count, meetingFlags.get(r.id) ?? false, urgentFlags.get(r.id) ?? false);
          highlights.push({ roomId: r.id, label: r.label, icon: ROOM_KIND_ICON[r.kind], occupantCount: count, activity });
        }
        highlights.sort((a, b) => ROOM_ACTIVITY_PRIORITY[b.activity] - ROOM_ACTIVITY_PRIORITY[a.activity] || b.occupantCount - a.occupantCount);
        setRoomHighlights(highlights.slice(0, 4));
        setMyRoomActivity(
          rid ? describeRoomActivity(getRoom(rid).kind, counts.get(rid) ?? 0, meetingFlags.get(rid) ?? false, urgentFlags.get(rid) ?? false) : "sepi"
        );
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
        setNearby(closestId ? live.rosterById.get(closestId) ?? null : null);
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

      if (myInteractionRef.current) {
        const item = furnitureById(FURNITURE, myInteractionRef.current.furnitureId);
        const config = item ? INTERACTION_BY_KIND[item.kind] : undefined;
        if (config?.momentary && now - interactionStartRef.current > MOMENTARY_INTERACTION_MS) {
          stopInteraction();
        }
        if (lastInteractableIdRef.current !== null) {
          lastInteractableIdRef.current = null;
          setNearestInteractable(null);
        }
        nearestInteractableRef.current = null;
      } else {
        const near = findNearestInteractable(posRef.current, FURNITURE);
        const nearId = near?.furniture.id ?? null;
        if (nearId !== lastInteractableIdRef.current) {
          lastInteractableIdRef.current = nearId;
          setNearestInteractable(near);
        }
        // Ref diupdate tiap frame tanpa syarat (beda dari state di atas
        // yang cuma berubah pas id-nya ganti) -- dibaca draw() buat
        // highlight in-world, murah banget jadi tidak perlu dihemat.
        nearestInteractableRef.current = near;
      }

      const cam = cameraRef.current;
      if (!cameraReadyRef.current || teleported) {
        cam.x = x;
        cam.y = y;
        cameraReadyRef.current = true;
      } else {
        cam.x += (x - cam.x) * 0.12;
        cam.y += (y - cam.y) * 0.12;
      }

      draw(now);
    }

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      step(dt, now);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <span className="font-bold">{room ? `${ROOM_KIND_ICON[room.kind]} ${room.label}` : "Halaman"}</span>
          </span>
          {room && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white"
              style={{ backgroundColor: `${ROOM_ACTIVITY_COLORS[myRoomActivity]}26` }}
              title="Keadaan ruangan ini sekarang"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ROOM_ACTIVITY_COLORS[myRoomActivity] }} />
              {ROOM_ACTIVITY_LABELS[myRoomActivity]}
            </span>
          )}
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
                      showToast(`Status: ${STATUS_LABELS[s]}`);
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

      <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl lg:flex-[2.2]" style={{ aspectRatio: "16 / 10" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

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
                  onChange={(ev) => setEmoteDraft(ev.target.value.slice(0, EMOTE_MAX_LENGTH))}
                  placeholder="Tulis sesuatu..."
                  maxLength={EMOTE_MAX_LENGTH}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEmotePickerOpen((v) => !v)}
              aria-label="Emote"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-800/90 text-white/80 shadow-lg transition-colors hover:bg-slate-700"
            >
              <Smile className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !audioMuted;
                setAudioMuted(next);
                setAudioMutedState(next);
              }}
              aria-label={audioMuted ? "Nyalakan suara" : "Matikan suara"}
              title={audioMuted ? "Nyalakan suara" : "Matikan suara"}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-800/90 text-white/80 shadow-lg transition-colors hover:bg-slate-700"
            >
              {audioMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
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
          {myInteraction ? (
            <button
              type="button"
              onClick={stopInteraction}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg"
            >
              <StopInteractIcon className="h-4 w-4" />
              Berhenti {INTERACTION_POSE_LABEL[myInteraction.kind]}
            </button>
          ) : (
            nearestInteractable && (
              <button
                type="button"
                onClick={() => startInteraction(nearestInteractable.furniture, nearestInteractable.config)}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg"
              >
                <Armchair className="h-4 w-4" />
                {nearestInteractable.config.verb(nearestInteractable.furniture.label ?? "")}
              </button>
            )
          )}
          {nearby && (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/60 p-1.5 shadow-lg backdrop-blur">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => performAction(a.id)}
                  disabled={actionOnCooldown}
                  title={`${a.label} ke ${firstName(nearby.fullName)}`}
                  aria-label={a.label}
                  className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-base transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {a.emoji}
                </button>
              ))}
            </div>
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
          WASD / panah untuk berjalan (tahan Shift untuk lari) · dekati rekan, NPC, atau perabot untuk berinteraksi
        </div>

        <Minimap posRef={posRef} remoteRef={remoteRef} othersInOffice={othersInOffice} />

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{toast}</span>
          </div>
        )}
      </div>

      <div className="lg:flex-[1.3]">
        <ActivityFeed roomHighlights={roomHighlights} />
      </div>
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

/** Minimap ringan: cuma kotak ruangan dari ROOMS (data, bukan render
 * canvas) + titik posisi sendiri & rekan yang sedang di Kantor Virtual.
 * Update posisi lewat interval singkat (bukan re-render React tiap frame)
 * -- cukup utk kebutuhan "jangan nyasar", tidak perlu presisi 60fps. */
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
