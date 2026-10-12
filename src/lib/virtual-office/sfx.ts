/**
 * SFX prosedural Kantor Virtual (permintaan Owner, Okt 2026: "biar lebih
 * mirip game asli"). Web Audio API murni, TANPA file aset eksternal --
 * selaras gaya "chunky pixel-art" yang 100% digambar lewat kode (lihat
 * draw2d.ts), bukan aset pihak ketiga. Semua suara cuma oscillator/noise
 * buffer pendek, volume rendah by design -- dipakai rame-rame multiplayer
 * jadi sengaja tidak dibuat "penuh"/ramai. Toggle mute tersimpan per-
 * browser (localStorage), default NYALA tapi pelan.
 */

const MUTE_KEY = "kv-audio-muted";
let ctxSingleton: AudioContext | null = null;

type WindowWithAudio = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  let ctx = ctxSingleton;
  if (!ctx) {
    const w = window as unknown as WindowWithAudio;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    ctxSingleton = ctx;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Preferensi mute tersimpan per-browser -- dibaca ulang tiap mau main
 * suara (bukan state React) supaya konsisten walau dipanggil dari dalam
 * game loop/ref yang tidak ikut siklus render. */
export function isAudioMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage bisa gagal (mode privat dsb) -- aman diabaikan, cuma
    // artinya preferensi tidak persist, bukan error fatal.
  }
}

function tone(freq: number, durMs: number, opts: { type?: OscillatorType; gain?: number; glideTo?: number } = {}): void {
  if (isAudioMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, ctx.currentTime + durMs / 1000);

  const peak = opts.gain ?? 0.08;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durMs / 1000 + 0.02);
}

/** Noise buffer pendek dengan decay linear + low-pass -- dasar suara
 * "benda tumpul"/langkah kaki (beda karakter dari tone() yang nada
 * jernih, lebih pas utk gestur/notifikasi). */
function noiseBurst(durMs: number, opts: { gain?: number; filterFreq?: number } = {}): void {
  if (isAudioMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const len = Math.max(1, Math.floor((ctx.sampleRate * durMs) / 1000));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.filterFreq ?? 900;
  const gain = ctx.createGain();
  gain.gain.value = opts.gain ?? 0.07;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

/** Langkah kaki -- noise pendek teredam. Cuma dipakai utk avatar SENDIRI
 * (lihat pemanggil di VirtualOfficeClient), bukan rekan lain, supaya
 * tidak berisik kalau banyak orang jalan bersamaan di kantor yang sama. */
export function playFootstep(): void {
  noiseBurst(55, { gain: 0.05, filterFreq: 500 });
}

/** Mulai/berhenti pakai perabot (duduk/kerja/dll) -- dua nada pendek,
 * naik pitch = mulai, turun = berhenti, biar beda kedengaran tanpa perlu
 * lihat layar. */
export function playInteractToggle(starting: boolean): void {
  tone(starting ? 320 : 260, 90, { gain: 0.07, glideTo: starting ? 460 : 180 });
}

/** Gestur tonjok/tos/lambai -- karakter suara beda tiap jenis (tonjok =
 * noise tumpul, tos = denting tinggi, lambai = whoosh pelan naik) biar
 * kedengaran beda walau durasinya cuma sepersekian detik, selaras dengan
 * ACTION_ANIM_MS di presence.ts. */
export function playAction(kind: "tonjok" | "tos" | "lambai"): void {
  if (kind === "tonjok") noiseBurst(70, { gain: 0.1, filterFreq: 300 });
  else if (kind === "tos") tone(900, 60, { type: "triangle", gain: 0.08 });
  else tone(520, 140, { gain: 0.06, glideTo: 640 });
}

/** Kirim emote/chat bubble -- "pop" lembut naik pitch. */
export function playEmote(): void {
  tone(700, 70, { gain: 0.06, glideTo: 900 });
}

/** Notifikasi "rekan mendekat" (toast). */
export function playNotify(): void {
  tone(600, 90, { gain: 0.05 });
}
