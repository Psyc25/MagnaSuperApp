"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMagnarentData } from "./MagnarentDataProvider";
import { cn } from "@/lib/cn";
import type { Booking, BookingStatus } from "@/lib/magnarent/types";
import { GLASS_BORDER, GLASS_SURFACE } from "@/lib/glass";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const STATUS_DOT: Record<BookingStatus, string> = {
  Menunggu: "bg-amber-500",
  Dikonfirmasi: "bg-emerald-500",
  Selesai: "bg-zinc-400",
  Dibatalkan: "bg-rose-400",
};

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: new Date(year, month, i - startWeekday + 1), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }
  return cells;
}

/**
 * Kalender bulanan booking — setiap hari menampilkan titik warna per status
 * booking yang mencakup tanggal itu. Dibangun murni dari `Date` bawaan
 * (tanpa library kalender) supaya tidak menambah dependency baru.
 */
export function BookingCalendar() {
  const { bookings, inventory } = useMagnarentData();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const cells = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    if (cells.length === 0) return map;
    // Rentang tiap booking dipotong ke sel yang TAMPIL di grid bulan ini --
    // dulu dibatasi 60 hari dari tanggal mulai, jadi sewa bulanan yang
    // panjang tampak kosong (alat seolah tersedia) setelah hari ke-60.
    const gridStart = cells[0].date;
    const gridEnd = cells[cells.length - 1].date;
    for (const b of bookings) {
      if (b.status === "Dibatalkan") continue;
      const start = new Date(`${b.tanggalMulai}T00:00:00`);
      const end = new Date(`${b.tanggalSelesai}T00:00:00`);
      let d = start < gridStart ? new Date(gridStart) : start;
      const last = end > gridEnd ? gridEnd : end;
      while (d <= last) {
        const key = toISO(d);
        const list = map.get(key) ?? [];
        list.push(b);
        map.set(key, list);
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      }
    }
    return map;
  }, [bookings, cells]);

  const itemName = (id: string) => inventory.find((i) => i.id === id)?.name ?? "—";
  const todayKey = toISO(today);

  return (
    <div className={cn("overflow-hidden rounded-2xl border shadow-sm", GLASS_SURFACE, GLASS_BORDER)}>
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5 dark:border-white/10">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-black/5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }, idx) => {
          const key = toISO(date);
          const dayBookings = bookingsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key + idx}
              className={cn(
                "min-h-[92px] border-b border-r border-black/5 p-1.5 dark:border-white/5",
                idx % 7 === 6 && "border-r-0",
                !inMonth && "bg-zinc-50/60 dark:bg-white/[0.02]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  isToday
                    ? "bg-blue-600 font-bold text-white"
                    : inMonth
                    ? "text-zinc-700 dark:text-zinc-300"
                    : "text-zinc-300 dark:text-zinc-600"
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayBookings.slice(0, 2).map((b) => (
                  <div
                    key={b.id}
                    title={`${b.namaKlien} — ${itemName(b.itemId)} (${b.status})`}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300"
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[b.status])} />
                    <span className="truncate">{b.namaKlien}</span>
                  </div>
                ))}
                {dayBookings.length > 2 && (
                  <p className="px-1 text-[10px] font-medium text-zinc-400">+{dayBookings.length - 2} lainnya</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-black/5 px-5 py-3 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        {(Object.keys(STATUS_DOT) as BookingStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
            {status}
          </span>
        ))}
      </div>
    </div>
  );
}
