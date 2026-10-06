"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ACCESSORIES,
  ACCESSORY_LABELS,
  HAIR_COLORS,
  HAIR_STYLES,
  HAIR_STYLE_LABELS,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type AvatarLook,
} from "@/lib/virtual-office/avatar-look";
import { saveAvatarLook } from "@/lib/virtual-office/actions";

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            aria-pressed={value === c}
            onClick={() => onPick(c)}
            className={cn(
              "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400",
              value === c ? "border-white" : "border-white/20"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Options<T extends string>({
  label,
  options,
  labels,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(o)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              value === o ? "border-white bg-white text-slate-900" : "border-white/20 text-white/80 hover:bg-white/10"
            )}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Panel "Ubah Karakter". Perubahan langsung terlihat di avatar sendiri
 * (onPreview); baru tersimpan ke akun saat tombol Simpan ditekan.
 */
export function CharacterEditor({
  initial,
  onPreview,
  onSaved,
  onClose,
}: {
  initial: AvatarLook;
  onPreview: (look: AvatarLook) => void;
  onSaved: (look: AvatarLook) => void;
  onClose: () => void;
}) {
  const [look, setLook] = useState<AvatarLook>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<AvatarLook>) {
    const next = { ...look, ...patch };
    setLook(next);
    onPreview(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveAvatarLook(look);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.look);
  }

  function handleCancel() {
    onPreview(initial);
    onClose();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Ubah Karakter</h2>
        <button type="button" onClick={handleCancel} aria-label="Tutup" className="rounded-full p-1 text-white/60 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Swatches label="Kulit" colors={SKIN_TONES} value={look.skin} onPick={(skin) => update({ skin })} />
        <Swatches label="Warna rambut / topi / hijab" colors={HAIR_COLORS} value={look.hair} onPick={(hair) => update({ hair })} />
        <Options label="Model rambut" options={HAIR_STYLES} labels={HAIR_STYLE_LABELS} value={look.hairStyle} onPick={(hairStyle) => update({ hairStyle })} />
        <Options label="Aksesori" options={ACCESSORIES} labels={ACCESSORY_LABELS} value={look.accessory} onPick={(accessory) => update({ accessory })} />
        <Swatches label="Baju" colors={SHIRT_COLORS} value={look.shirt} onPick={(shirt) => update({ shirt })} />
        <Swatches label="Celana" colors={PANTS_COLORS} value={look.pants} onPick={(pants) => update({ pants })} />
      </div>
      {error && <p className="mt-3 text-xs font-semibold text-rose-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={handleCancel} className="rounded-full px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
          Batal
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Simpan karakter
        </button>
      </div>
    </div>
  );
}
