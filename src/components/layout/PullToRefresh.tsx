"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

// Jarak tarikan minimal (px) sebelum refresh benar-benar dipicu saat jari
// dilepas — di bawah ini dianggap "belum niat", indikator kembali ciut.
const PULL_THRESHOLD = 70;
// Batas visual seberapa jauh indikator boleh "ditarik" turun, supaya terasa
// elastis (redam gerakan jari) alih-alih ngikut 1:1 kaku sampai jauh sekali.
const MAX_PULL = 110;
// Cuma aktif di lebar mobile (sama seperti breakpoint md: yang dipakai
// Sidebar/MobileNav) — di desktop ada mouse+keyboard, tidak butuh gestur ini,
// dan mencegah trackpad presisi-tinggi/perangkat sentuh non-HP ikut kepicu.
const MOBILE_BREAKPOINT = 768;

/**
 * Pull-to-refresh (tarik turun untuk refresh) — permintaan Owner: PWA yang
 * ter-install standalone di HP tidak punya tombol reload browser sama
 * sekali, jadi satu-satunya cara pengguna dapat data terbaru selama ini
 * adalah "clear up" (force-close/hapus dari recent apps) aplikasinya —
 * merepotkan dan gampang dikira aplikasinya nge-bug. Gestur ini
 * meniru pola native iOS/Android: tarik turun saat halaman SUDAH di paling
 * atas (bukan cuma "scroll ke bawah" biasa di tengah konten, yang tidak
 * boleh ikut kepicu) memicu `window.location.reload()` — reload penuh
 * (bukan `router.refresh()`) supaya sekalian ambil build terbaru kalau ada
 * deploy baru, bukan cuma data Server Component saja.
 *
 * Sengaja TIDAK memanggil `preventDefault()` di mana pun — semua listener
 * `passive: true` supaya scroll native (termasuk scroll di dalam kontainer
 * bertingkat seperti daftar pesan Chat) tidak pernah terganggu; komponen ini
 * murni menambah overlay indikator di atas konten, tidak pernah mencegat
 * gestur aslinya.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // State (bukan cuma ref) karena ikut menentukan gaya transisi saat render.
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    function isMobileWidth() {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }

    function handleTouchStart(e: TouchEvent) {
      if (refreshing || !isMobileWidth() || window.scrollY > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
      setIsPulling(true);
    }

    function updatePull(distance: number) {
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    }

    function handleTouchMove(e: TouchEvent) {
      if (!pullingRef.current || startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0 && window.scrollY <= 0) {
        updatePull(Math.min(delta / 1.6, MAX_PULL));
      } else {
        pullingRef.current = false;
        setIsPulling(false);
        updatePull(0);
      }
    }

    function handleTouchEnd() {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      startYRef.current = null;
      setIsPulling(false);
      // Dibaca dari ref, bukan di dalam updater setPullDistance -- updater
      // harus murni (React bisa memanggilnya dua kali), sedangkan reload()
      // adalah efek samping.
      const shouldRefresh = pullDistanceRef.current >= PULL_THRESHOLD;
      updatePull(0);
      if (shouldRefresh) {
        setRefreshing(true);
        window.location.reload();
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [refreshing]);

  return (
    <>
      <div
        aria-hidden
        className="flex items-center justify-center overflow-hidden md:hidden"
        style={{
          height: refreshing ? 44 : pullDistance,
          transition: isPulling ? "none" : "height 200ms ease-out",
        }}
      >
        <RefreshCw
          className={cn("h-5 w-5 text-zinc-400 dark:text-zinc-500", refreshing && "animate-spin")}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${pullDistance * 3}deg)`, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }
          }
        />
      </div>
      {children}
    </>
  );
}
