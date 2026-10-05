# Analisis Gap MagnaRent vs Aplikasi Rental Equipment Eksternal

Metodologi sama seperti analisis gap Magnativ sebelumnya: audit kode
MagnaSuperApp modul Magnarent (tabel Supabase + Server Actions + komponen
UI yang benar-benar ada, bukan asumsi), dibandingkan dengan fitur umum
aplikasi manajemen rental peralatan kelas dunia (Booqable, EZRentOut,
Current RMS, Rentman, Cheqroom, dan sejenisnya).

## Fitur MagnaRent yang SUDAH ada (terverifikasi dari kode)

- **Inventaris**: nama, kategori, lokasi/gudang, harga sewa per hari,
  total unit, unit maintenance (otomatis mengurangi unit yang bisa
  disewa)
- **Booking**: tambah/edit/hapus, cek ketersediaan & konflik jadwal
  real-time (bahkan race-condition-safe lewat RPC terkunci di database —
  dua staf submit hampir bersamaan untuk alat yang sama tidak akan
  bentrok), status (Menunggu/Dikonfirmasi/Selesai/Dibatalkan), status
  pembayaran (Belum Bayar/DP/Lunas) dengan nominal DP, tautan opsional ke
  klien terdaftar di Magnativ
- **Kalender & scheduler** booking (tampilan visual jadwal alat)
- **Checklist kondisi alat**: foto + catatan saat alat keluar dan saat
  kembali (bukti kondisi, mengurangi sengketa kerusakan)
- **Deposit/jaminan**: uang tunai/KTP/SIM/lainnya, status sudah
  dikembalikan atau belum
- **Log servis/maintenance** per alat: tanggal, jenis (rutin/perbaikan),
  biaya
- **Laporan perputaran (utilisasi)**: alat paling laris vs kandidat
  "idle" yang layak dilepas/dijual, window 90 hari
- **Pengingat pengembalian**: notifikasi H-1 sebelum jatuh tempo +
  pengingat berkala kalau sudah lewat tanggal kembali belum ditandai
  selesai
- **Notifikasi push** ke tim Magnarent untuk booking baru & alat baru
- **Log aktivitas** semua perubahan

Kesimpulan: fondasi inti (booking engine + cek ketersediaan) justru
**lebih matang** dari kebanyakan modul lain di MagnaSuperApp — proteksi
race condition di level database adalah hal yang bahkan tidak semua
aplikasi rental komersial punya.

## Fitur umum aplikasi rental eksternal yang BELUM ada di MagnaRent

| # | Fitur | Ada di MagnaRent? | Prioritas |
|---|---|---|---|
| 1 | Harga bertingkat (mingguan/bulanan lebih murah per hari) | ❌ cuma harga/hari flat | Menengah |
| 2 | Kode QR/barcode per unit alat (scan keluar-masuk gudang) | ❌ | Menengah |
| 3 | Pelacakan per-unit individual (nomor seri per unit fisik, bukan cuma hitungan total) | ❌ cuma total unit & unit maintenance | Menengah |
| 4 | Surat perjanjian sewa (kontrak) otomatis dari data booking | ❌ (checklist kondisi ada, tapi bukan dokumen kontrak) | Tinggi |
| 5 | Katalog/toko online — klien booking sendiri tanpa staf input manual | ❌ semua booking diinput staf | Tinggi |
| 6 | Pembayaran & deposit online (bukan cuma dicatat manual) | ❌ | Tinggi |
| 7 | Penjadwalan pengiriman/pengambilan (dispatch, sopir, rute) | ❌ | Menengah |
| 8 | Portal klien self-service (lihat riwayat sewa, invoice, status) | ❌ | Tinggi |
| 9 | Filter ketersediaan per lokasi/gudang saat multi-gudang | ⚠️ ada field lokasi tapi belum ada filter/transfer antar gudang di alur booking | Rendah |
| 10 | Laporan pendapatan per aset (ROI/depresiasi alat) | ⚠️ ada nilai booking terkonfirmasi di ringkasan, belum ada laporan ROI per alat secara eksplisit | Rendah |

## Rekomendasi Prioritas

**Prioritas Tinggi (butuh keputusan/bahan dari Owner — sama seperti 3 gap
Magnativ yang sudah dicatat di `CATATAN-BAHAN-GAP-MAGNATIV.md`):**
- #5 Katalog/toko online booking sendiri — bisa disatukan dengan #8 portal
  klien (satu pintu login klien untuk kedua divisi Magnativ & Magnarent)
- #6 Pembayaran & deposit online — **bisa pakai keputusan payment gateway
  yang SAMA dengan gap Magnativ** (Midtrans/Xendit), tidak perlu keputusan
  terpisah
- #4 Kontrak sewa — kalau mau tanda tangan digital sah secara hukum,
  butuh keputusan e-signature yang **sama dengan gap kontrak Magnativ**;
  tapi versi PDF kontrak tanpa tanda tangan digital (auto-generate dari
  data booking, dicetak/di-scan manual) BISA dibangun sekarang tanpa
  bahan tambahan

**Prioritas Menengah (bisa langsung dikerjakan, TANPA bahan eksternal):**
- #1 Harga bertingkat (mingguan/bulanan) — murni logika internal
- #2 Kode QR per unit alat — bisa generate QR client-side gratis (library
  open-source), tidak perlu API berbayar
- #3 Pelacakan per-unit individual — tambahan struktur data, tidak perlu
  bahan eksternal
- #7 Penjadwalan pengiriman sederhana (tandai driver/jadwal antar-jemput
  per booking) — versi ringan tanpa optimasi rute otomatis, tidak perlu
  bahan eksternal

**Prioritas Rendah:**
- #9 Filter/transfer antar gudang
- #10 Laporan ROI per alat

## Ringkasan bahan yang diperlukan (gabungan dengan Magnativ)

Karena portal klien dan payment gateway **overlap** dengan gap Magnativ
yang sudah dicatat, tidak perlu keputusan Owner dua kali — cukup satu
keputusan per topik yang berlaku untuk kedua divisi:
- Payment gateway (Midtrans/Xendit + status merchant account) — dipakai
  Magnativ (pelunasan proyek) & Magnarent (pembayaran/deposit sewa)
- Portal klien self-service (scope + metode login) — dipakai Magnativ
  (approve konten/kontrak) & Magnarent (booking sendiri, riwayat sewa)
- E-signature kontrak (kalau mau versi tanda tangan digital sah hukum) —
  dipakai Magnativ (kontrak EO) & Magnarent (perjanjian sewa alat)

Gap #7 dispatch pengiriman TIDAK ikut digabung karena murni kebutuhan
Magnarent (armada antar-jemput alat), belum tentu relevan buat Magnativ.
