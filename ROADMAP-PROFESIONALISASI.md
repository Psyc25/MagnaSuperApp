# Roadmap "Naik Kelas" MagnaSuperApp

Hasil audit menyeluruh ke seluruh aplikasi (37 halaman, 58 komponen, 42 file
library, 19 migrasi database) untuk permintaan: *"modifikasi keseluruhan
fitur dan fungsi, perbarui seperti aplikasi profesional yang berjalan."*

Kesimpulan audit: **fondasinya sudah cukup solid** — alur CRUD di semua
modul lengkap (tambah/edit/hapus semua ada), aksi berbahaya (hapus) sudah
dijaga konfirmasi, dan banyak aturan bisnis penting sudah ditangani dengan
baik (mis. tidak bisa hapus alat yang masih dibooking, tidak bisa hapus
pengajuan modal yang sudah diputuskan investor). Yang bikin terasa "belum
sekelas aplikasi profesional" itu lebih ke arah:

1. Tidak ada jaring pengaman kalau ada error/halaman lambat (layar putih
   kosong kalau ada masalah, bukan pesan yang enak dilihat).
2. Ada beberapa hal yang ditulis berulang-ulang di banyak file (warna
   badge status, menu Admin/Investor) — bukan bug, tapi rawan jadi tidak
   sinkron kalau salah satu lupa diperbarui.
3. Semua query database ambil SEMUA baris tanpa batas — aman sekarang
   (datanya masih sedikit), tapi makin lambat kalau data sudah ribuan
   baris (booking, invoice, log aktivitas).
4. Karena tidak ada proses testing otomatis sebelum deploy (setiap
   perubahan langsung dari saya → Anda push → langsung tayang ke
   pengguna), perlu jaring pengaman tambahan di proses deploy-nya sendiri.

Supaya risiko tetap kecil (sudah kejadian sekali kemarin ada bug lolos ke
production), perbaikan ini akan dikerjakan **bertahap** — pola yang sama
seperti Tahap 1-11 sebelumnya — bukan sekaligus dalam satu commit raksasa.

---

## Tahap 12 — Jaring pengaman & rapikan yang berulang (SELESAI)

Risiko paling rendah, dampak paling terasa. Semua item ini murah untuk
saya kerjakan dan tidak mengubah cara kerja fitur yang sudah ada:

- **Cek otomatis sebelum deploy** — tambah 1 file GitHub Actions yang
  otomatis mengecek kode Anda (`next build` + cek tipe TypeScript) setiap
  kali di-push, SEBELUM Vercel benar-benar men-deploy-nya. Ini jaring
  pengaman supaya bug seperti kemarin (fungsi yang salah dilewatkan ke
  komponen) bisa ketahuan lebih awal.
- **Halaman error/lambat yang lebih enak dilihat** — sekarang kalau ada
  error atau halaman lambat dimuat, yang muncul cuma layar putih kosong.
  Ditambahkan halaman "Terjadi kesalahan, coba lagi" dan indikator
  loading yang branded di setiap modul.
- **Tutup celah kecil pesan error mentah** — 2 tempat (notifikasi push,
  hapus staf) sempat menampilkan pesan error database mentah ke layar;
  diseragamkan seperti modul lain yang sudah rapi.
- **Satukan daftar menu Admin/Investor** — sekarang menu di Sidebar
  (tampilan laptop) dan Menu Bawah (tampilan HP) ditulis dua kali
  terpisah — kalau nambah menu baru dan lupa update salah satu, tampilan
  HP & laptop bisa beda sendiri. Disatukan jadi satu sumber.

## Tahap 13 — Rapikan kode yang berulang (SELESAI)

- Satukan warna badge status (Menunggu/Disetujui/Lunas/dst) yang saat ini
  ditulis ulang di 14 file berbeda jadi satu file bersama — supaya kalau
  suatu saat mau ganti skema warna, cukup ubah satu tempat.
- Ganti 2 tempat yang masih pakai kotak konfirmasi bawaan browser
  (`window.confirm`, tampilannya polos & beda dari kotak konfirmasi
  aplikasi) ke komponen konfirmasi yang sudah dipakai di 13 tempat lain.

## Tahap 14 — Batasi query yang bisa membengkak (SELESAI)

- Tambah batas jumlah data yang diambil sekaligus untuk tabel yang
  paling berpotensi tumbuh besar (booking, invoice, log aktivitas) —
  supaya halaman tetap cepat dibuka walau datanya sudah ribuan baris ke
  depannya. Langkah awal aman (kasih batas 200 baris terbaru), langkah
  lanjutan (halaman 1/2/3/dst di tabel) menyusul kalau memang mulai
  kerasa perlu.

## Tahap 15+ — Perbaikan besar (didiskusikan dulu sebelum dikerjakan)

Ini butuh keputusan/diskusi dulu karena dampaknya lebih luas atau makan
waktu lebih lama:

- **Pencarian lintas modul** — sekarang tiap halaman punya pencarian
  sendiri-sendiri (klien, invoice, booking, dst berbeda kotak pencarian).
  Bikin satu pencarian global lintas semua modul itu proyek cukup besar
  (perlu index pencarian di database) — worth dibahas kalau memang
  kepakai sehari-hari.
- Halaman-halaman besar (mis. pengelola Booth Project ~750 baris kode)
  bisa dipecah jadi komponen lebih kecil supaya lebih gampang dirawat ke
  depannya — ini murni soal kerapian kode di belakang layar, tidak
  mengubah tampilan/fungsi sama sekali buat Anda.

---

Status (5 Oktober 2026): Tahap 12–14 sudah selesai. Tahap 15+ masih
menunggu diskusi.

## QC Menyeluruh — 5 Oktober 2026

- **Asisten AI**: hampir semua tool memakai nama kolom yang tidak ada di
  database (mis. `nama`/`kategori`, padahal `name`/`category`), jadi setiap
  pertanyaan data gagal. Ditulis ulang mengikuti skema asli. Aksi
  (buat booking, ubah status, catat pengeluaran) sekarang lewat Server
  Action yang sama dengan form: cek bentrok jadwal, jurnal otomatis, dan
  log aktivitas ikut berlaku. Tool dipilih sesuai divisi user, bisa
  beberapa langkah dalam satu pesan, ada tanggal hari ini, dan bisa
  dibatalkan dengan "Batal".
- **Konfirmasi "Ya" ganda** (migrasi 0085): tabel pesan AI tidak punya izin
  UPDATE, jadi aksi yang sudah dikonfirmasi bisa jalan dua kali.
- **Keamanan** (migrasi 0086): fungsi jurnal bisa dipanggil tanpa login
  memakai anon key publik (termasuk hapus jurnal dana investor). Hak
  aksesnya dicabut dari pengguna anonim. Fungsi sisa uji coba
  `ping_test_fn*` dinonaktifkan; migrasi 0087 (hapus total) perlu
  dijalankan manual di SQL Editor.
- **Akuntansi**: laporan Laba-Rugi/Neraca/Arus Kas sekarang mengambil data
  per halaman. Sebelumnya angkanya bisa salah tanpa error begitu jurnal
  melewati ±1000 baris.
- **Jurnal otomatis** sekarang ditunggu (`await`) sampai selesai, bukan
  fire-and-forget yang bisa terputus di serverless.
- **Realisasi Event**: pengeluaran yang terkait booking/proyek/event yang
  kemudian dibatalkan tidak lagi tampil "—" atau kehilangan kaitannya.
