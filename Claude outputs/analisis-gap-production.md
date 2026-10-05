# Analisis Gap Modul Production vs Software Fabrikasi/Job-Shop & MRP Eksternal

Metodologi sama seperti dua analisis gap sebelumnya (Magnativ, MagnaRent): audit kode
MagnaSuperApp modul Production (`src/lib/production/*`, `src/components/production/*`,
`src/app/dashboard/production/*` — tabel Supabase, Server Actions, dan komponen UI yang
benar-benar ada, bukan asumsi), dibandingkan dengan pola fitur umum di dua kategori software
eksternal yang relevan: (1) software job-shop/bengkel fabrikasi custom seperti JobBOSS²,
EZIIL, Fulcrum — menonjolkan quoting, work order, penjadwalan lantai produksi, pelacakan jam
kerja kru; dan (2) software MRP/ERP ringan untuk manufaktur kecil seperti Katana MRP,
MRPeasy, Fishbowl — menonjolkan multilevel Bill of Materials (BOM), Material Requirements
Planning (MRP) yang memproyeksikan kebutuhan pembelian ke depan, dan pelacakan stok
multi-gudang dengan barcode.

## Fitur Production yang SUDAH ada (terverifikasi dari kode)

- **Proyek Booth**: CRUD lengkap dengan funnel tahap Desain → Produksi → Finishing →
  Instalasi → Selesai/Dibatalkan, opsional tautan ke klien terdaftar di Magnativ, budget,
  status pembayaran (Belum Bayar/DP/Lunas) dengan nominal DP, catatan bebas, pencarian &
  filter status.
- **Alokasi material per proyek**: baris material dinamis (bisa ditambah/dihapus bebas) dengan
  cek ketersediaan stok real-time — race-condition-safe lewat RPC `save_booth_project_checked`
  yang mengunci baris material per transaksi database (pola sama persis dengan proteksi
  bentrok booking di Magnarent); proyek yang sedang diedit otomatis dikecualikan dari
  perhitungan alokasinya sendiri.
- **Ekspor Proposal/BOQ (Bill of Quantities) otomatis**: spreadsheet penawaran + rincian
  material disusun OTOMATIS dari data yang sudah diisi tim (daftar material + harga satuan
  dari master Gudang) — Owner tinggal klik ekspor, tidak perlu isi ulang apa pun, langsung
  siap kirim ke klien.
- **Papan Kanban Linimasa Produksi**: proyek dikelompokkan per tahap dalam kolom, badge "lewat
  jadwal" untuk instalasi yang sudah overdue, tombol "Majukan" satu klik untuk memindah tahap
  tanpa buka form edit penuh.
- **Checklist instalasi & bongkar per proyek**: foto + catatan, dua tahap terpisah (saat
  instalasi dan saat bongkar), upsert satu baris per (proyek, tahap).
- **Penugasan kru per proyek**: nama bebas + peran (Koordinator Lapangan/Tukang-Instalatur/
  Desainer/Sopir-Logistik/Lainnya) + kontak + catatan, banyak kru per proyek.
- **Dokumentasi Sebelum/Sesudah**: galeri foto per proyek dengan keterangan — ini sudah jadi
  galeri sungguhan yang menggantikan placeholder lama, lengkap dengan halaman unggah sendiri
  (bukan dummy statis seperti yang sempat ditemukan di Galeri Kategori Alat MagnaRent sebelum
  diperbaiki).
- **Gudang & Material**: CRUD stok material (kategori, satuan, lokasi, harga per satuan),
  status "stok menipis" otomatis berdasar ambang minimum, nilai stok gudang terhitung
  otomatis, guard tidak bisa hapus material yang masih dialokasikan ke proyek aktif.
- **Purchase Order (PO)**: catat pesanan ke supplier (material opsional, qty, harga satuan,
  tanggal pesan/perkiraan tiba, catatan), tandai "Diterima" (otomatis menambah stok lewat
  fungsi database `receive_purchase_order` dalam satu transaksi supaya tidak ada celah stok
  gagal ter-update), batalkan PO, hapus PO (diblokir kalau sudah Diterima demi menjaga jejak
  riwayat perubahan stok).
- **Alat & Perkakas**: registry alat berat/perkakas terpisah dari material konsumsi (kategori,
  kondisi Baik/Perlu Servis/Rusak, catatan), riwayat pemakaian per alat (proyek terkait,
  dipakai oleh siapa, tanggal pinjam/kembali), tandai sudah dikembalikan.
- **Laporan Pemakaian Material Lintas Proyek**: rekap material yang dipakai ULANG di lebih
  dari satu proyek vs yang belum pernah dipakai sama sekali — fitur yang secara eksplisit
  dibangun menjawab permintaan investor untuk memantau pola pemakaian material dari waktu ke
  waktu (beda dengan alarm stok menipis yang cuma soal ketersediaan saat ini).
- **Ringkasan/Dashboard**: kartu KPI (proyek aktif, material stok menipis, nilai stok gudang,
  budget proyek aktif vs total) lengkap rasio, donut chart distribusi tahap proyek, daftar
  proyek mendekati deadline & material stok menipis.
- **Notifikasi push** ke tim Production (+ akses penuh) untuk material baru, stok menipis,
  proyek booth baru, dan PO baru, plus log aktivitas semua perubahan.

Kesimpulan: modul Production justru salah satu yang paling matang secara operasional di
MagnaSuperApp — sudah punya alur lengkap dari alokasi material dengan proteksi race
condition, checklist kualitas instalasi/bongkar, sampai laporan pemakaian material lintas
proyek yang bahkan tidak semua software job-shop komersial punya sebagai fitur inti (mis. di
EZIIL, modul BOM/procurement/inventory justru jadi add-on terpisah dari inti, bukan bawaan).

## Fitur umum software fabrikasi/job-shop & MRP eksternal yang BELUM ada di Production

| # | Fitur | Ada di Production? | Prioritas |
|---|---|---|---|
| 1 | Material Requirements Planning (MRP) — proyeksi kebutuhan pembelian ke depan berdasar jadwal proyek & lead time supplier | ❌ cuma alarm reaktif "stok di bawah ambang minimum", belum ada proyeksi kebutuhan ke depan dari proyek yang sudah terjadwal | Menengah |
| 2 | Template/resep Bill of Material (BOM) per tipe booth | ❌ alokasi material selalu diinput manual dari nol tiap proyek baru, tidak ada template yang bisa dipakai ulang | Menengah |
| 3 | Kode QR/barcode per alat & batch material (scan keluar-masuk gudang) | ❌ | Menengah |
| 4 | Pencatatan jam kerja kru & profitabilitas proyek (planned vs actual hours, biaya tenaga kerja masuk ke margin) | ❌ kru tercatat nama/peran/kontak, tapi tidak ada jam kerja atau biaya tenaga kerja yang ikut dihitung ke margin proyek | Tinggi |
| 5 | Database vendor/supplier (kontak, riwayat harga, lead time) | ❌ nama supplier di PO cuma teks bebas, tidak ada master data vendor tersendiri | Menengah |
| 6 | Lampiran gambar kerja/desain (denah, rendering, shop drawing) per proyek | ❌ yang ada baru foto checklist & dokumentasi before/after, belum ada tempat unggah gambar kerja/desain resmi | Tinggi |
| 7 | Tahap "Quote/Penawaran" terpisah dengan kalkulator margin sebelum jadi proyek resmi | ❌ proyek langsung dibuat di tahap Desain; ekspor Proposal/BOQ baru tersedia SETELAH proyek dibuat, bukan sebelum negosiasi | Rendah |
| 8 | Multi-gudang & transfer stok antar lokasi | ⚠️ ada field lokasi per material, tapi belum ada alur transfer/pemindahan stok antar gudang | Rendah |
| 9 | Portal klien memantau progres proyek booth sendiri | ❌ klien cuma menerima invoice manual, tidak bisa pantau tahap Desain→Instalasi sendiri | Tinggi (overlap dgn gap Magnativ & MagnaRent) |
| 10 | Jejak kepatuhan mutu terstruktur (siapa mengerjakan apa, per tahap kerja — gaya standar EN 1090) | ⚠️ checklist instalasi/bongkar + data kru sudah tercatat, tapi belum terhubung jadi satu jejak kepatuhan formal per tahap | Rendah |

## Rekomendasi Prioritas

**Prioritas Tinggi (sebagian butuh keputusan Owner, sebagian bisa langsung jalan):**

- **#6 Lampiran gambar kerja/desain** — TIDAK butuh bahan berbayar (bisa pakai pola Supabase
  Storage yang sama dengan galeri dokumentasi yang sudah ada), tapi butuh keputusan Owner
  soal jenis file yang didukung (PDF/gambar saja, atau juga file CAD seperti DWG) dan siapa
  yang boleh unggah/lihat — staf desain saja, atau klien juga (kalau iya, ini nyambung ke
  portal klien di poin #9)
- **#4 Jam kerja & profitabilitas proyek** — versi internal (staf isi jam kerja manual per
  kru) BISA dibangun sekarang tanpa bahan eksternal; kalau mau terhubung ke sistem payroll
  sungguhan, itu baru butuh keputusan Owner soal sistem payroll yang dipakai
- **#9 Portal klien pantau progres** — **overlap dengan gap portal klien yang sudah dicatat
  di Magnativ & MagnaRent**, tidak perlu keputusan Owner terpisah; kalau portal klien jadi
  dibangun, cukup tambahkan tampilan progres proyek booth di portal yang sama

**Prioritas Menengah (bisa langsung dikerjakan, TANPA bahan eksternal):**

- #1 MRP sederhana — proyeksi kebutuhan material dari proyek yang sudah terjadwal (tanggal
  instalasi) dibanding stok saat ini, murni logika internal dari data yang sudah ada
- #2 Template BOM per tipe booth — struktur data tambahan untuk menyimpan resep alokasi
  material yang sering dipakai, tinggal "isi ulang" ke proyek baru
- #3 Kode QR per alat/material — sama seperti fitur QR MagnaRent, bisa generate client-side
  gratis (library open-source), tidak perlu API berbayar
- #5 Database vendor/supplier — tabel master data baru untuk kontak & riwayat harga supplier,
  tidak perlu API berbayar

**Prioritas Rendah:**

- #7 Tahap Quote terpisah sebelum proyek resmi (nice-to-have — Proposal/BOQ yang sudah ada
  sekarang, meski muncul setelah proyek dibuat, sudah cukup menjawab kebutuhan utama)
- #8 Multi-gudang & transfer stok antar lokasi
- #10 Jejak kepatuhan mutu terstruktur

## Ringkasan bahan yang diperlukan (gabungan dengan Magnativ & MagnaRent)

Portal klien self-service (#9) overlap dengan gap yang sama yang sudah tercatat di Magnativ &
MagnaRent — cukup **satu** keputusan Owner (scope akses + metode login klien) yang berlaku
untuk **ketiga** divisi sekaligus, bukan tiga keputusan terpisah. Rincian keputusan yang
dibutuhkan ada di `bahan-diperlukan.md`.

Lampiran gambar kerja/desain (#6) dan jam kerja & profitabilitas (#4) murni kebutuhan internal
Production — TIDAK overlap dengan divisi lain, jadi dua keputusan kecil ini berdiri sendiri
(rinciannya ada di bagian Rekomendasi Prioritas di atas, tidak perlu dokumen bahan terpisah
karena scope-nya kecil).
