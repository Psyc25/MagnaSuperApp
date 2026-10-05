"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarRange, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDateID } from "@/lib/shared/utils";
import {
  addSeasonalPricingRule,
  deleteSeasonalPricingRule,
  listSeasonalPricingRules,
} from "@/lib/magnarent/extras-actions";
import type { SeasonalPricingRule } from "@/lib/magnarent/extras-types";
import type { InventoryItem } from "@/lib/magnarent/types";

/**
 * Kelola aturan pricing dinamis musiman (rekomendasi Bagian 5-C #16,
 * migrasi 0069) -- staf definisikan rentang tanggal musim ramai/sepi
 * (mis. "Musim Nikahan Des-Jan": +20%) berlaku untuk satu alat atau semua
 * alat. Hasilnya muncul sebagai SARAN harga di form booking
 * (`BookingScheduler.tsx`), bukan mengubah harga dasar alat secara langsung.
 */
export function SeasonalPricingModal({ inventory, onClose }: { inventory: InventoryItem[]; onClose: () => void }) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<SeasonalPricingRule[] | null>(null);
  const [label, setLabel] = useState("");
  const [itemId, setItemId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [multiplierPct, setMultiplierPct] = useState("20");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setRules(await listSeasonalPricingRules());
  }

  useEffect(() => {
    let cancelled = false;
    listSeasonalPricingRules().then((rows) => {
      if (!cancelled) setRules(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addSeasonalPricingRule({
      itemId: itemId || undefined,
      label,
      startDate,
      endDate,
      multiplierPct: Number(multiplierPct),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLabel("");
    setStartDate("");
    setEndDate("");
    setMultiplierPct("20");
    await reload();
    showToast("Aturan musim ditambahkan.");
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteSeasonalPricingRule(id);
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    await reload();
  }

  const itemName = (id?: string) => (id ? inventory.find((i) => i.id === id)?.name ?? "—" : "Semua Alat");

  return (
    <Modal open onClose={onClose} title="Pricing Dinamis Musiman">
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-zinc-100 p-3.5 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label mis. Musim Nikahan"
              className="col-span-2 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="col-span-2 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white dark:[&>option]:bg-zinc-900"
            >
              <option value="">Berlaku untuk semua alat</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 focus:ring-2 dark:border-white/10 dark:text-white"
            />
            <input
              type="number"
              value={multiplierPct}
              onChange={(e) => setMultiplierPct(e.target.value)}
              placeholder="Persen, mis. 20 atau -10"
              className="col-span-2 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm text-zinc-900 outline-none ring-blue-500/40 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:text-white"
            />
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {submitting ? "Menyimpan..." : "+ Tambah Aturan Musim"}
          </button>
        </form>

        {rules === null ? (
          <p className="text-xs text-zinc-400">Memuat...</p>
        ) : rules.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Belum ada aturan musim" description="Tambah aturan untuk musim ramai/sepi di atas." />
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-3.5 py-2.5 text-sm dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                    {r.label} <span className="text-zinc-400">({itemName(r.itemId)})</span>
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatDateID(r.startDate)} – {formatDateID(r.endDate)} · {r.multiplierPct > 0 ? "+" : ""}
                    {r.multiplierPct}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  disabled={busyId === r.id}
                  className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
