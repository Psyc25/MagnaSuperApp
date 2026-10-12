/**
 * Util gambar 2D "chunky pixel-art" dipakai bersama HouseScene.tsx &
 * Avatars.tsx (Kantor Virtual -- rewrite Oktober 2026 dari
 * react-three-fiber ke Canvas 2D API, permintaan Owner: "diubah seperti
 * gambar referensi, dibuat interaktif seperti game"). Gaya visualnya
 * ORIGINAL/dibuat lewat kode -- bukan menjiplak gambar referensi yang
 * dikirim (itu cuma dipakai sebagai inspirasi palet warna & suasana,
 * sudah dikonfirmasi ke Owner). Satu gaya dipakai konsisten di semua
 * "benda berdiri" (tembok, perabot, badan avatar): shadow tipis + isi
 * gradasi terang(atas)->gelap(bawah) + garis tepi gelap.
 */

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [148, 163, 184]; // fallback slate-400 kalau warna tidak dikenal
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** amount 0..1: 0 = warna asli, 1 = putih penuh. */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, amount));
  return rgbToHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}

/** amount 0..1: 0 = warna asli, 1 = hitam penuh. */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, amount));
  return rgbToHex(r * (1 - a), g * (1 - a), b * (1 - a));
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type ChunkyOpts = {
  radius?: number;
  /** false = tidak ada shadow (dipakai utk elemen kecil yang nempel di
   * atas elemen lain, biar shadow-nya tidak dobel/menumpuk). */
  shadow?: boolean;
  /** Warna glow (shadowBlur) -- dipakai utk benda menyala (lampu, layar). */
  glow?: string;
  opacity?: number;
  outline?: string;
};

/** Kotak "chunky": shadow di bawah-kanan + gradasi terang(atas)->gelap(bawah)
 * + garis tepi gelap. Dipakai utk tembok & hampir semua perabot kotak. */
export function chunkyRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts: ChunkyOpts = {}
): void {
  const radius = opts.radius ?? 2.5;
  ctx.save();
  if (opts.opacity !== undefined) ctx.globalAlpha = opts.opacity;
  if (opts.shadow !== false) {
    ctx.fillStyle = "rgba(2,6,23,0.32)";
    roundRectPath(ctx, x + 2.5, y + 3.5, w, h, radius);
    ctx.fill();
  }
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 16;
  }
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, lighten(color, 0.26));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, darken(color, 0.22));
  ctx.fillStyle = grad;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = opts.outline ?? "rgba(15,23,42,0.6)";
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

/** Lingkaran "chunky" (kepala, roda, batu) -- gradasi radial terang di
 * kiri-atas supaya terasa cembung, + tepi gelap. */
export function chunkyCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  opts: ChunkyOpts = {}
): void {
  ctx.save();
  if (opts.opacity !== undefined) ctx.globalAlpha = opts.opacity;
  if (opts.shadow !== false) {
    ctx.fillStyle = "rgba(2,6,23,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, cy + 2.5, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 16;
  }
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lighten(color, 0.3));
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = opts.outline ?? "rgba(15,23,42,0.6)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Teks dengan outline tebal -- label nama/perabot/ruangan di atas canvas
 * supaya tetap terbaca di atas background apa pun (gaya umum game 2D). */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    outline?: string;
    align?: CanvasTextAlign;
    weight?: string;
    stroke?: boolean;
  } = {}
): void {
  const size = opts.size ?? 10;
  ctx.save();
  ctx.font = `${opts.weight ?? "700"} ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  if (opts.stroke !== false) {
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = opts.outline ?? "rgba(0,0,0,0.75)";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = opts.color ?? "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}
