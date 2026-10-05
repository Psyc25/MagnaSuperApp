# Analisis Kompetitor vs MagnaSuperApp

**Tanggal riset**: 24 September 2026
**Diminta oleh**: Owner Magna Technology
**Tujuan**: Memetakan modul & kelengkapan seluruh platform sejenis (global SaaS per-kategori, kompetitor lokal Indonesia, dan all-in-one event production suite), membandingkannya dengan MagnaSuperApp, lalu menyusun daftar pembaruan yang belum dimiliki kompetitor agar MagnaSuperApp bisa jadi yang teratas di kelasnya.

**Status proses**: Sesuai arahan Owner — **riset dulu, laporan temuan dulu, baru diskusi mana yang akan dibangun**. Laporan ini adalah tahap riset & temuan. Belum ada satupun fitur baru yang dibangun/dikerjakan — semua item di bawah adalah usulan untuk didiskusikan dan diprioritaskan bersama Owner sebelum eksekusi.

---

## Ringkasan Eksekutif

Empat jalur riset dijalankan secara paralel terhadap total **~27 kompetitor** di 4 kategori: (1) software rental peralatan global, (2) software job-shop/MRP & manufaktur untuk pembanding modul Production, (3) software lokal Indonesia lintas kategori (EO, rental, produksi), dan (4) platform all-in-one event production suite/EO global.

Temuan paling penting secara strategis:

- **Tidak ada satupun kompetitor — baik global maupun lokal — yang menggabungkan ketiga fungsi (manajemen event/EO + rental alat + fabrikasi booth/MRP) dalam satu sistem terintegrasi** seperti MagnaSuperApp. Bahkan pemain ERP besar Indonesia (HashMicro, ScaleOcean) yang punya modul Event, Rental, dan Manufacturing sekalipun menjualnya sebagai produk vertikal terpisah, bukan satu paket untuk model bisnis gabungan EO-rental-fabrikasi. Ini adalah **white space** nyata di pasar — MagnaSuperApp sudah unggul secara struktural, bukan sekadar fitur.
- Namun di level fitur per-modul, banyak kompetitor sudah lebih maju di area spesifik: **AI assistant/chatbot berbasis bahasa natural** (Momentus Ask Mo, Booqable Bo, Fulcrum Archie, Fishbowl AI, HoneyBook AI, Katana AI), **portal self-service klien** (Tripleseat Guest Portal, HoneyBook Smart Files, Quipli storefront), **e-signature terintegrasi**, **payment gateway online**, dan **AI demand forecasting/replenishment** (Katana, Fishbowl, Point of Rental).
- Pasar Indonesia sendiri secara umum belum mengadopsi QRIS di software rental manapun yang diriset — ini gap pasar, bukan hanya gap MagnaSuperApp, sehingga bisa jadi keunggulan cepat jika diimplementasikan.

---

## Bagian 1 — Kompetitor All-in-One Event Production Suite / EO Software

Riset atas: Momentus Technologies, Bizzabo, Tripleseat, HoneyBook, Cvent (CventIQ), Perfect Venue, Curate, EventUp Planner.

| Platform | Fitur kunci | Fitur AI | Sumber |
|---|---|---|---|
| **Momentus Technologies** | MomentusMAX (System of Record/Intelligence/Action), MAX for Sales (Lead/Calendar/Revenue Engine — auto-draft proposal event lengkap + margin), Analytics dashboard funnel/revenue | Ask Mo (Q&A produk & data bahasa natural, jawaban berupa chart) | [gomomentus.com/ai](https://gomomentus.com/ai) |
| **Bizzabo** | Registrasi multi-track, integrasi CRM 2.500+ sistem, Klik SmartBadges (BLE, click-to-connect, lead capture tanpa scanner) | Live heatmap traffic & engagement attendee real-time | [bizzabo.com/klik-smart-event-badges](https://www.bizzabo.com/event-management-software/klik-smart-event-badges) |
| **Tripleseat** | Guest Portal: chat terintegrasi per-event, live document sync (no versi ganda), e-signature, payment (PartyPay) | — | [tripleseat.com/blog/customer-portal-2](https://tripleseat.com/blog/customer-portal-2/) |
| **HoneyBook** | Smart Files: satu link untuk pilih layanan + jadwal + tanda tangan + bayar deposit | HoneyBook AI (ringkas proyek, draft email, alert lead bernilai tinggi), AI Automations Builder (bahasa natural → draft workflow) | [honeybook.com/ai-information](https://www.honeybook.com/ai-information) |
| **Cvent (CventIQ)** | AI 3D event diagramming, automated RFP response drafting, akuisisi Goldcast (video-to-content otomatis) | CventIQ (dibangun dari 25+ tahun data event proprietary) | [cvent.com/en/cventiq](https://www.cvent.com/en/cventiq) |
| **Perfect Venue** | Tier Premium: task & event owners, AI Email Reply, marketing tracking | AI Email Reply (tier Premium) | [perfectvenue.com/pricing](https://www.perfectvenue.com/pricing) |
| **Curate** | Messaging & notification center gratis, change tracking real-time (jumlah tamu/alergi/menu), BEO & packing list otomatis | — | [abnewswire.com](https://www.abnewswire.com/pressreleases/curate-launches-catering-crm-with-builtin-messaging-giving-event-caterers-a-single-platform-for-proposals-client-communication-and-operations_804544.html) |
| **EventUp Planner** | Agenda builder self-service, website builder, virtual studio hybrid | — | [eventupplanner.com](https://eventupplanner.com/) |

**Relevansi terhadap Magnativ**: Magnativ sudah punya checklist + histori status/PIC, sourcing/vendor+price, dan pembeda sumber undangan Client vs Brand pitching — namun belum punya lapisan AI, portal klien terpadu, atau live document sync/messaging yang terikat ke item checklist.

## Bagian 2 — Kompetitor Software Rental Peralatan (untuk Magnarent)

Riset atas: Booqable, Current RMS, Rentman, Cheqroom, EZRentOut, Quipli, TWICE Commerce (Rentle), Point of Rental, Alert Rental, RentMaster.

| Platform | Fitur kunci | Fitur AI | Harga (indikatif) |
|---|---|---|---|
| **Booqable** | Booking page embed, dokumen otomatis, e-signature, payment (Stripe/PayPal/Square) | **Bo** — chatbot insight bisnis + deteksi shortage/bentrok jadwal | $29–349+/bln |
| **Current RMS** | Inventory barcode/container, kalender drag-and-drop, Labor & Transport Scheduling | — | Custom |
| **Rentman** | QR/barcode multi-lokasi, **subrent management**, crew scheduling skill-based | — | Custom, trial 30 hari |
| **Cheqroom** | QR/barcode/**RFID**, GPS real-time, audit trail, auto-block barang rusak | **IRO** (Intelligent Resource Orchestration) — prediksi ketersediaan dari histori | $184–367+/bln |
| **EZRentOut** | Sub-renting, cycle billing, GPS & telematics (tier Enterprise) | — | $399–499+/bln |
| **Quipli** | Self-service portal penuh, license scanning, damage waiver insurance | **Quinn** — auto-respon permintaan sewa 24/7 | $6.000/lokasi/tahun |
| **TWICE Commerce** | Multi-channel sync, kit-based bundles, pricing berbasis segmen pelanggan | — | Custom |
| **Point of Rental** | Rental Intelligence Suite — NL query dashboard | **AI Insights** — nightly fleet review otomatis | Custom |
| **Alert Rental** | GPS dispatch, mobile app "Rover", job costing & commission | — | $200–500+/bln |
| **RentMaster** | Sync kantor↔toko online real-time | — | Tidak dipublikasikan |

**Tren industri**: AI demand forecasting & dynamic pricing jadi arah 2025-2026, tapi implementasi konkret baru di Booqable, Point of Rental, Quipli, Cheqroom — mayoritas kompetitor lain belum.

## Bagian 3 — Kompetitor Job-Shop / MRP / Manufaktur (untuk Production)

Riset atas: JobBOSS², Katana MRP, Fulcrum, MRPeasy, Fishbowl, Odoo Manufacturing, ExhibitForce, ConventionSuite.

| Platform | Fitur kunci | Fitur AI | Harga (indikatif) |
|---|---|---|---|
| **JobBOSS² (ECI)** | Estimating→order, scheduling whiteboard, NC/CAPA quality | **AI BOM Builder** — upload PDF/foto → auto-extract BOM | Custom |
| **Katana MRP** | BOM multi-level, shop floor app, serial/batch/lot traceability | **AI demand forecasting & replenishment** (proyeksi 12 bulan) | Free–$299+/bln |
| **Fulcrum** | Job costing live, compliance AS9100D/ISO 9001 | **Autoschedule** (optimasi jadwal live) + **Archie** (chat data shop-floor) | $6.000–18.000/tahun |
| **MRPeasy** | MRP II/finite capacity Gantt, drag-drop reschedule, piece-payment labor | — | $49–149/user/bln |
| **Fishbowl Manufacturing** | MRP↔sales order, multi-lokasi + 3PL | AI demand forecasting, **AI Insights**, conversational data assistant | Custom |
| **Odoo Manufacturing** | PLM (Engineering Change Orders), OEE per work center, IoT shop-floor | — | Free–$61/user/bln |
| **ExhibitForce** | CRM + asset-tracking booth, production queue + file-approval workflow | — | Custom |
| **ConventionSuite** | Dashboard tunggal per-job, rental-asset availability forecasting, portal exhibitor | **Invoice automation** (AI document scanning) | Custom |

**Catatan**: Data ExhibitForce/ConventionSuite soal crew-scheduling tidak sepenuhnya bisa diverifikasi (halaman diblokir robots.txt) — ditandai "tidak ditemukan di materi publik", bukan "dipastikan tidak ada".

**Relevansi terhadap Production**: Production sudah lebih lengkap dari kebanyakan exhibit-house software (ExhibitForce/ConventionSuite) untuk BOM template, vendor database, dan material locking — tapi kalah di sisi AI forecasting, autoschedule, dan portal client eksternal.

## Bagian 4 — Kompetitor Lokal Indonesia (Lintas Kategori)

Riset atas: HashMicro, MyRental.id, ScaleOcean, Barantum, SewaScale, PaYou Rental, Rentra.id, SevenRent, plus pencarian khusus niche fabrikasi booth.

| Platform | Segmen | Fitur kunci | Catatan |
|---|---|---|---|
| **HashMicro** | ERP enterprise | Modul Event Management + modul Rental ERP **terpisah**; AI agent "Hashy" (HashMicro X) | Tidak ada modul fabrikasi booth; harga tidak dipublikasikan |
| **ScaleOcean** | ERP enterprise | Manufacturing ERP + Rental ERP **terpisah**; "ScaleMind" AI-ERP | Tidak ada modul event sama sekali |
| **MyRental.id** | Rental UMKM | Booking anti-double-booking, **kuitansi/surat jalan/kontrak → WhatsApp 1 klik** | Rp74rb–186rb/bln, transparan |
| **Barantum** | CRM/Omnichannel | WA Business API + AI Agent auto-respon 24/7, halaman industri EO & rental mobil | Bukan software inventaris/operasional |
| **SewaScale** | Rental UMKM | Booking page builder, marketplace internal, opsi **lifetime deal** | — |
| **PaYou Rental** | Rental kendaraan/alat berat | Biaya operasional granular per-unit, depresiasi aset otomatis | Rp3jt–19,5jt/tahun, transparan |
| **Rentra.id** | Rental UMKM | Booking otomatis + laporan keuangan otomatis | Data terbatas |
| **SevenRent** | Rental kendaraan | **Rent-to-rent (R2R)** tracking, reminder WA | Rp199rb–997rb/user |

**Kesimpulan strategis (poin paling penting di seluruh laporan)**: **Tidak ada satupun pemain lokal — termasuk ERP raksasa seperti HashMicro dan ScaleOcean — yang menggabungkan EO + rental alat + fabrikasi booth dalam satu sistem terintegrasi.** Modul-modul itu selalu dijual terpisah per-vertikal. MagnaSuperApp mengisi *white space* yang bahkan tidak disentuh pemain ERP besar sekalipun.

**Gap pasar lokal yang berlaku untuk semua pemain** (bukan hanya MagnaSuperApp): tidak ada satupun yang terverifikasi mengimplementasikan **QRIS** sebagai fitur pembayaran produk.

---

## Bagian 5 — Daftar Konsolidasi Rekomendasi (Lintas 4 Riset)

Daftar di bawah menggabungkan ide dari keempat jalur riset, dikelompokkan per divisi dan diberi tingkat prioritas awal (Tinggi/Sedang/Rendah) berdasarkan seberapa sering fitur itu muncul di kompetitor dan seberapa besar dampaknya ke pengalaman klien/operasional. **Ini adalah usulan untuk didiskusikan — belum ada keputusan, belum ada yang dibangun.**

### A. Lintas-Divisi (Platform-wide)

1. **[Tinggi]** Portal klien self-service satu-link (proposal, e-signature, status invoice, tracking progres) — muncul di HoneyBook, Tripleseat, Quipli, ConventionSuite, ExhibitForce. Ini **tumpang-tindih langsung** dengan 2 dari 4 item yang sudah ditandai "menunggu keputusan Owner" di `bahan-diperlukan.md` (e-signature proposal/kontrak & portal self-service klien) — riset ini menguatkan bahwa kedua item itu memang jadi standar industri, bukan sekadar nice-to-have.
2. **[Tinggi]** E-signature digital untuk kontrak & serah-terima — hampir semua kompetitor rental maupun EO sudah punya ini (Booqable, Current RMS, Rentman, EZRentOut, Quipli, TWICE Commerce, Tripleseat, HoneyBook). Sama, ini adalah salah satu dari 4 item `bahan-diperlukan.md`.
3. **[Tinggi]** Integrasi payment gateway online (mis. Midtrans/Xendit) untuk deposit & pelunasan — juga salah satu dari 4 item `bahan-diperlukan.md`, dan disebut berulang di riset rental maupun EO.
4. **[Sedang]** Asisten AI internal berbasis bahasa natural ("Tanya Magna") untuk query data operasional lintas modul (Ask Mo, Bo, Archie, Fishbowl AI, Katana AI) — bisa dibangun bertahap, mulai dari 1 modul dulu (misal Production) sebelum diperluas.
5. **[Rendah]** Integrasi QRIS untuk pembayaran — gap di seluruh pasar lokal, bukan hanya MagnaSuperApp; nilai diferensiasi cepat jika Owner mau jadi yang pertama.

### B. Magnativ (Event/Project Management)

6. **[Sedang]** Auto-draft proposal & quotation dari data sourcing/vendor historis (ala MAX for Sales Revenue Engine, CventIQ).
7. **[Sedang]** Live document sync + thread diskusi terikat langsung ke item checklist (ala Curate, Tripleseat) — memperkuat histori status/PIC yang sudah ada dengan lapisan komunikasi klien.
8. **[Rendah]** Lead scoring otomatis pada pipeline client berdasarkan sumberUndangan, nilai kontrak historis, dan kecepatan respons.
9. **[Rendah]** Modul khusus auto-draft respons RFP/brief untuk kategori "Brand pitching" dari data proyek sejenis.
10. **[Rendah]** Heatmap/analitik keterlibatan on-site (check-in QR, dwell-time) sebagai laporan pasca-event bernilai jual ke klien brand.

### C. Magnarent (Rental Peralatan)

11. **[Tinggi]** Portal self-service pelanggan untuk browsing katalog, cek ketersediaan, dan booking mandiri (ala Booqable/Quipli/TWICE Commerce) — saat ini booking sepenuhnya lewat staf internal.
12. **[Sedang]** Notifikasi proaktif harian/mingguan (alat idle lama, biaya maintenance naik, demand musiman) — meningkatkan laporan utilisasi 90-hari yang sudah ada dari pasif jadi aktif.
13. **[Sedang]** GPS/live-tracking kendaraan pengiriman terintegrasi ke modul dispatch yang sudah ada.
14. **[Sedang]** Crew/labor scheduling terintegrasi langsung dengan booking alat (drag-and-drop, filter skill & ketersediaan) — relevan karena Magna juga menugaskan kru teknis, bukan cuma menyewakan alat.
15. **[Rendah]** Manajemen multi-lokasi/gudang dengan transfer stok antar cabang & subrent tracking (relevan jika ada rencana ekspansi kota/venue lain).
16. **[Rendah]** Pricing dinamis berbasis musim/tanggal event di atas tiered pricing durasi yang sudah ada.
17. **[Rendah]** Dukungan RFID untuk bulk-scan gudang saat event besar (pelengkap QR per-unit yang sudah ada).

### D. Production (Fabrikasi Booth)

18. **[Tinggi]** Portal client/exhibitor untuk approval shop-drawing & tracking progres install/dismantle tanpa WhatsApp manual (ala ConventionSuite, ExhibitForce).
19. **[Sedang]** AI extractor BOM/BOQ dari gambar shop-drawing yang sudah diupload sebagai attachment (ala JobBOSS² AI BOM Builder) — saat ini file desain baru tersimpan statis.
20. **[Sedang]** Lapisan prediktif pada MRP projection yang sudah ada, belajar dari histori konsumsi material per tipe booth (ala Katana/Fishbowl demand forecasting).
21. **[Sedang]** Piece-rate/upah borongan per unit-booth di atas timelog manual kru yang sudah ada — relevan untuk model kerja lepas yang umum di industri fabrikasi booth Indonesia.
22. **[Rendah]** Autoschedule crew & material lintas proyek paralel saat prioritas berubah mendadak (ala Fulcrum Autoschedule).
23. **[Rendah]** Modul NC/CAPA (non-conformance & tindakan korektif) terpisah dari checklist operasional yang ada, untuk riwayat kualitas vendor/crew.
24. **[Rendah]** Subcontracting tracking terintegrasi BOM untuk material yang dikirim ke vendor eksternal (laser cutting, printing besar) lalu diterima kembali sebagai barang jadi.
25. **[Rendah]** Forecast ke depan untuk material reuse (bukan hanya laporan historis) berdasarkan jadwal dismantle proyek lain yang sedang berjalan.

---

## Penutup & Langkah Berikutnya

Laporan ini murni tahap **riset dan temuan**, sesuai arahan: *"riset dulu, laporan temuan, baru diskusi mana yang dibangun."* Tidak ada kode, migrasi, atau fitur baru yang dikerjakan pada tahap ini.

Tiga catatan strategis untuk didiskusikan bersama Owner sebelum menentukan prioritas eksekusi:

1. Empat item di **Bagian 5-A** (portal klien, e-signature, payment gateway, AI assistant) muncul paling konsisten di seluruh kompetitor dan tiga di antaranya sudah tercatat sebagai keputusan tertunda Owner di `bahan-diperlukan.md` — ini kandidat kuat untuk dibahas lebih dulu.
2. Karena tidak ada kompetitor (lokal maupun global) yang menggabungkan ketiga fungsi EO+rental+fabrikasi, keunggulan struktural MagnaSuperApp sudah ada — pembaruan di atas sifatnya memperkuat/mempercepat pengalaman pengguna per-modul, bukan mengejar ketertinggalan mendasar.
3. Sejumlah ide (AI BOM extractor, AI forecasting, autoschedule) memerlukan keputusan teknis lanjutan (model AI mana, biaya API, dsb.) — relevan untuk didiskusikan bersamaan dengan rencana "9Router"/AI gateway yang sudah pernah dibahas sebelumnya, karena bisa jadi infrastruktur AI yang sama dipakai untuk semua fitur AI di atas.

Silakan diskusikan dengan Owner fitur mana yang ingin diprioritaskan — saya siap lanjut ke tahap perencanaan teknis begitu ada arahan.
