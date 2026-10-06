"use client";

import { useEffect, useRef, useState } from "react";
import { submitDriverLocation } from "@/lib/magnarent/extras-actions";

const SEND_INTERVAL_MS = 20000;

type ShareStatus = "idle" | "active" | "denied" | "error" | "unsupported";

/**
 * Form sisi sopir (client component, halaman publik `/lacak/[token]`) --
 * TIDAK ada tampilan peta di sini (butuh API key peta eksternal, dicatat
 * sebagai keterbatasan di laporan). Sopir cukup tekan tombol sekali, HP
 * kirim koordinat berkala tiap 20 detik selama tab dibuka -- staf lihat
 * hasilnya sebagai link Google Maps di DeliveryScheduleModal.
 */
export function DriverLocationShareForm({ token }: { token: string }) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function sendOnce() {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await submitDriverLocation(token, pos.coords.latitude, pos.coords.longitude);
        if (result.ok) setLastSentAt(new Date());
      },
      (err) => {
        // Hanya izin ditolak yang menghentikan pengiriman. Timeout/sinyal GPS
        // lemah bersifat sementara -- coba lagi di interval berikutnya. Dulu
        // status jadi "denied" tapi interval tetap jalan diam-diam.
        if (err.code === err.PERMISSION_DENIED) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setStatus("denied");
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function handleStart() {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("active");
    sendOnce();
    // Bersihkan interval lama dulu -- tombol Mulai yang ditekan dua kali dulu
    // meninggalkan interval yatim yang terus mengirim lokasi setelah Berhenti.
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(sendOnce, SEND_INTERVAL_MS);
  }

  function handleStop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setStatus("idle");
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-rose-600">
        Browser HP ini tidak mendukung fitur lokasi. Coba pakai Chrome/Safari versi terbaru.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-slate-500">
        Tekan tombol di bawah supaya tim gudang bisa memantau posisi Anda selama perjalanan.
        Lokasi dikirim otomatis tiap 20 detik selama halaman ini dibuka.
      </p>

      {status === "active" ? (
        <>
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Lokasi aktif dibagikan
            {lastSentAt && (
              <span className="block text-xs font-normal text-emerald-600">
                Terakhir terkirim {lastSentAt.toLocaleTimeString("id-ID")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleStop}
            className="w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600"
          >
            Berhenti Bagikan
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Mulai Bagikan Lokasi
        </button>
      )}

      {status === "denied" && (
        <p className="text-xs text-rose-600">
          Izin lokasi ditolak. Aktifkan izin lokasi untuk browser ini di pengaturan HP, lalu coba lagi.
        </p>
      )}
    </div>
  );
}
