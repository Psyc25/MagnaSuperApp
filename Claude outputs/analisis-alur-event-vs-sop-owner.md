# Alur "Event" di MagnaSuperApp vs SOP Proposal Project (Papan Tulis Owner)

*Disusun 23 September 2026. Menjawab pertanyaan: apa yang terjadi begitu sebuah event baru masuk lewat halaman Admin, bagaimana divisi lain ikut terlibat, bagaimana tracking progress-nya, dan apakah ini sudah sesuai dengan alur di papan tulis Owner. Semua klaim soal kondisi aplikasi diverifikasi langsung dari kode (`src/lib/events/*`, `src/app/dashboard/admin/events/*`, `src/app/dashboard/tracking-event/*`, `src/lib/magnative/types.ts`), bukan dari kesan pakai di browser saja.*

## Ringkasan singkat (untuk Owner yang buru-buru)

Ada **dua alur berbeda** yang sebenarnya sedang dibicarakan, dan aplikasi saat ini baru mendigitalkan **separuh belakangnya saja**:

1. **Alur SOP di papan tulis** = alur PENJUALAN/PITCHING — dari client memberi undangan/briefing, sampai proposal di-present, sampai deal WIN atau LOSE. Alur ini **belum ada sama sekali digitalisasinya** di MagnaSuperApp — semuanya masih terjadi di luar sistem (rapat, WA, dokumen offline), dan cuma "muncul" di aplikasi sebagai satu label status ("Pitching") pada proyek Magnativ, itu pun kalau Admin memilih membuatkan record-nya.
2. **Modul "Event" / "Tracking Progress Event"** yang sudah dibangun di MagnaSuperApp adalah alat untuk tahap SETELAH deal disetujui (SETELAH "WIN") — yaitu checklist persiapan, sourcing, dan tracking progress lintas 3 divisi (Magnarent, Magnativ, Production) sampai hari-H. Bagian ini modelnya cukup dekat dengan langkah "1. Project: Checklist Project & Sourcing" + "Timeline Project" di papan tulis.

Jadi jawaban singkatnya: **belum sepenuhnya sesuai**. Bagian "sesudah WIN" sudah tertangani cukup baik, tapi bagian "sebelum WIN" (briefing, MOM, draft proposal, submit, present, keputusan menang/kalah) sama sekali tidak tercatat di sistem manapun. Rincian lengkap & rekomendasi ada di bagian bawah.

## Bagian 1 — Sistematika alur "Event" di aplikasi SAAT INI (langkah demi langkah)

Modul ini bernama **"Tracking Progress Event"** di kode, dibangun bertahap (Tahap A sampai E). Berikut urutan nyata yang terjadi:

**Langkah 1 — Admin membuat Event baru** (`/dashboard/admin/events`, HANYA bisa diakses akun "Akses Penuh")
Admin mengisi form: Nama Event, Nama Klien, Jenis Event (opsional — pilih dari daftar yang sudah dibuatkan sebelumnya di halaman "Jenis Event"), Lokasi, Tanggal Mulai, Tanggal Selesai, dan Catatan. Titik ini adalah "Event In" — event baru resmi tercatat di sistem.

**Langkah 2 — Checklist otomatis ter-clone (kalau pakai Jenis Event)**
Kalau Admin memilih sebuah "Jenis Event" (mis. "Grab KOL Gathering", "Wedding", dll — jenis-jenis ini dan template checklist standarnya dikelola terpisah di halaman "Jenis Event"), semua baris template checklist jenis itu langsung disalin jadi checklist AKTUAL milik event ini. Tiap baris checklist punya: Kategori (bebas diisi, mis. "Venue", "Dekorasi", "Percetakan", dst), Nama Item, Detail, Info Qty, Catatan, dan Status awal "Belum Mulai". Kalau tidak pakai Jenis Event, checklist dimulai kosong dan diisi manual/import Excel belakangan.

**Langkah 3 — Notifikasi otomatis ke 3 divisi operasional**
Begitu event tersimpan, sistem otomatis mengirim notifikasi push ke SEMUA staf Magnarent, Magnativ, dan Production: *"Event Baru — [Nama Event] baru dibuat. Cek checklist & kaitkan booking/proyek yang relevan."* Ini titik pertama divisi lain "tahu" ada event baru.

**Langkah 4 — Admin mengaitkan Event ke data divisi yang relevan**
Di halaman detail event, Admin bisa mencari & mengaitkan (link) event ini ke booking/proyek yang SUDAH ADA di masing-masing divisi — booking Magnarent, proyek Magnativ, atau proyek booth Production. Kaitan ini (`event_links`) yang jadi dasar supaya data lintas divisi (mis. piutang, invoice) bisa saling terhubung dan terlihat bersama.

**Langkah 5 — Staf 3 divisi update progress lewat "Papan Tracking"** (`/dashboard/tracking-event`, terbuka untuk Magnarent/Magnativ/Production/Akses Penuh — investor diblokir)
Ini halaman TERPISAH dari halaman Admin di Langkah 1-4. Di sini staf operasional (BUKAN cuma Admin) memilih event, lalu untuk tiap baris checklist yang jadi tanggung jawabnya, mereka:
- Mengubah **Status**: Belum Mulai → Sample → Approval → Preparation → Production → Finish (5 tahap ini persis diminta Owner sebagai standar untuk SEMUA jenis item checklist, bukan cuma barang fisik).
- Menunjuk **PIC** (siapa yang mengerjakan) dari daftar staf 3 divisi operasional + Akses Penuh.
Checklist dikelompokkan per Kategori di papan ini, jadi tiap divisi bisa fokus ke kategori yang jadi bagiannya sambil tetap melihat progress kategori lain.

**Langkah 6 — Progress terlihat otomatis di dashboard**
Baik halaman Admin (daftar Event) maupun Papan Tracking menampilkan progress bar per event, dihitung otomatis dari jumlah item checklist berstatus "Finish" dibagi total item — jadi Owner/Admin/Finance bisa lihat sekilas seberapa siap sebuah event tanpa buka satu-satu.

**Langkah 7 (paralel, modul terpisah) — "Realisasi Event"** (`/dashboard/realisasi-event`, terbuka untuk semua divisi kecuali investor)
Di luar checklist, tiap divisi bisa mencatat pengeluaran NYATA untuk event/proyek terkait di sini — pengeluaran ini otomatis masuk ke jurnal akuntansi perusahaan. Ini alur uang-keluar untuk event yang sudah berjalan, berjalan paralel dengan checklist di atas.

## Bagian 2 — Perbandingan poin-demi-poin dengan papan tulis Owner

| Langkah di papan tulis | Ada di aplikasi? | Kondisi nyata |
|---|---|---|
| 1. Invitation/Briefing dari Client/Brand → Jaron/Admin | **Tidak ada** | Tidak ditemukan fitur pencatatan undangan/briefing masuk dari client di modul manapun. Masih manual di luar sistem. |
| 2. Briefing (internal) | **Tidak ada** | Sama seperti di atas — tidak ada tempat mencatat hasil briefing. |
| 3. MOM, Audio Recording, Transcript | **Tidak ada** | Tidak ada fitur upload/simpan rekaman, transkrip, atau notulen rapat di manapun di aplikasi. |
| Draft Proposal Deck | **Tidak ada** (kecuali Production) | Tidak ada pembuat/template proposal untuk Magnativ maupun Magnarent. Production PUNYA fitur mirip: tombol "Ekspor Proposal" di modul Booth Project yang otomatis menyusun BOQ (Bill of Quantities) dari data material proyek jadi file Excel siap kirim — tapi ini cuma untuk Production, dan sifatnya ekspor data yang sudah ada, bukan alat menyusun draft proposal dari nol. |
| Draft Budget/Quotation | **Sebagian** | Field `budget` ada di level Proyek Magnativ & Production, tapi cuma satu angka total, bukan alat penyusun quotation/rincian item-per-item sebelum deal. |
| Project Checklist & Sourcing (sebelum submit) | **Tidak ada di tahap ini** | Checklist di aplikasi baru bisa dibuat SETELAH Admin resmi membuat "Event" (lihat Bagian 1) — di papan tulis, checklist & sourcing ini disiapkan SEBELUM submit proposal, sebagai bahan proposal itu sendiri. Urutannya terbalik dari yang ada di aplikasi. |
| Team Creative → 2D/3D Design, Motion Design | **Tidak ada pembagian tim eksplisit** | Checklist item punya field "Kategori" bebas teks & "PIC" (satu orang), tapi tidak ada konsep "Tim Creative" vs "Tim Project" sebagai peran struktural. Admin BISA saja menamai kategori checklist "Desain 2D"/"Desain 3D"/"Motion Design" secara manual, tapi ini konvensi penamaan bebas, bukan struktur yang dijamin sistem. |
| Team Project → masukkan ke proposal deck | **Tidak ada** | Tidak ada tempat menyusun/menggabungkan proposal deck dari input tim. |
| Submit Proposal | **Tidak ada** | Tidak ada status/penanda "proposal sudah dikirim ke client" di manapun. |
| Present Proposal & Budget | **Tidak ada** | Sama seperti di atas. |
| WIN | **Analog longgar**: status Proyek Magnativ "Pitching" → "Perencanaan"/"Berjalan" | Saat Admin/staf mengubah status proyek Magnativ dari "Pitching" ke "Perencanaan", itu SECARA IMPLISIT berarti deal menang — tapi ini cuma perubahan satu dropdown status, tidak ada alur/approval/pencatatan khusus yang menandai "ini titik keputusan menang". |
| LOSE → Kenapa kalah, alasannya apa | **Tidak ada field khusus** | Kalau proyek dibatalkan, statusnya diubah ke "Dibatalkan" — TIDAK ADA field wajib "alasan kalah" yang diminta sistem. Kalau mau dicatat, harus manual ditulis staf di kolom "Catatan" bebas, dan tidak ada yang memaksa/mengingatkan untuk mengisinya. |
| 1. Project: Checklist Project & Sourcing (setelah WIN) | **Ada, cukup dekat** | Ini paling pas dipetakan ke modul "Event" (Bagian 1 Langkah 1-2): checklist per kategori dengan qty info & catatan. Bedanya: sourcing vendor (mis. harga dari supplier percetakan) TIDAK terhubung ke checklist ini — Magnativ punya database Vendor terpisah (termasuk kategori "Percetakan", persis seperti contoh di papan tulis), tapi antara checklist Event dan database Vendor itu dua sistem yang TIDAK saling terhubung otomatis. |
| Timeline Project | **Sebagian** | Event punya Tanggal Mulai/Selesai, dan tiap checklist item punya tahapan Sample→Approval→Preparation→Production→Finish yang secara implisit membentuk garis waktu produksi — tapi tidak ada tampilan Gantt/timeline visual, dan tidak ada tanggal target per item checklist (cuma status, tanpa deadline per baris). |

## Bagian 3 — Kesimpulan

**Belum sepenuhnya sesuai dengan alur di papan tulis.** Yang sudah terbangun rapi di aplikasi adalah tahap OPERASIONAL setelah keputusan bisnis diambil: checklist per kategori, penunjukan PIC lintas 3 divisi, tracking status 5 tahap (Sample→Finish), notifikasi otomatis, dan progress bar — ini semua match dengan semangat "Checklist Project & Sourcing" + "Timeline Project" di cabang WIN pada papan tulis.

Yang SAMA SEKALI belum tersentuh sistem adalah seluruh tahap SEBELUM keputusan menang/kalah: undangan dari client, briefing, notulen rapat (MOM/rekaman/transkrip), penyusunan draft proposal & budget, proses submit, presentasi ke client, sampai keputusan resmi menang atau kalah beserta alasannya. Semua ini masih berjalan manual di luar MagnaSuperApp (kemungkinan besar lewat WhatsApp, Google Docs/Slides, atau rapat langsung), dan baru "masuk" ke sistem kalau seseorang secara manual membuatkan record Proyek Magnativ berstatus "Pitching" — itu pun cuma berupa satu label status, bukan alur bertahap seperti di papan tulis.

Konsekuensi praktisnya: kalau Owner ingin melihat riwayat *kenapa* sebuah pitching menang atau kalah, atau ingin melacak berapa lama proses dari undangan sampai keputusan, **data itu tidak ada di MagnaSuperApp sama sekali** — harus dicari manual di WhatsApp/dokumen masing-masing tim.

## Bagian 4 — Rekomendasi (untuk didiskusikan, belum dikerjakan)

Sesuai kebiasaan kerja saya di proyek ini, saya tidak langsung membangun ini tanpa konfirmasi — berikut opsi yang bisa dipilih Owner, urutan berdasarkan dampak:

1. **Prioritas tinggi** — Tambah field "Alasan Kalah" (wajib diisi) saat status Proyek Magnativ diubah ke "Dibatalkan". Ini perubahan kecil tapi langsung menutup gap paling konkret dari papan tulis (baris "LOSE → Kenapa kalah").
2. **Prioritas sedang** — Modul "Pipeline Proposal" baru: pencatatan tahap Invitation → Briefing → Submit → Present sebagai status berjenjang pada proyek (mirip pola status checklist event yang sudah ada), plus tempat upload file MOM/rekaman/draft proposal. Ini pekerjaan lebih besar karena perlu skema tabel baru.
3. **Prioritas sedang** — Hubungkan checklist Event ke database Vendor Magnativ yang sudah ada, supaya sourcing (harga, kategori vendor seperti Percetakan) langsung terlihat dari checklist, tidak perlu buka dua tempat terpisah.
4. **Prioritas rendah** — Tambah kolom "Tim" (mis. Tim Creative/Tim Project) pada checklist item, terpisah dari kategori bebas teks yang sekarang, supaya pembagian kerja sesuai papan tulis (2D/3D/Motion Design vs Project) lebih terstruktur dan bisa difilter.
5. **Prioritas rendah** — Tambah tanggal target (deadline) per baris checklist, bukan cuma status, supaya "Timeline Project" bisa ditampilkan sebagai Gantt chart sederhana, bukan cuma tanggal mulai/selesai event secara keseluruhan.

Poin 1 bisa dikerjakan cepat kalau Owner setuju. Poin 2 perlu didiskusikan dulu — bentuk paling pas untuk MOM/rekaman/draft proposal apa (upload file biasa, atau ada template khusus), karena ini keputusan bisnis, bukan cuma teknis.
