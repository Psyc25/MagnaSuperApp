import fs from "fs";
import path from "path";
import { Document, Page, StyleSheet, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";
import { formatDateID, formatRupiah } from "@/lib/shared/utils";
import type { Invoice, InvoiceDivision, InvoiceStatus } from "./types";

/**
 * Update Opsional 1, item 7 — invoice tampil ATAS NAMA DIVISI yang dipilih
 * (logo + nama + tagline divisi), BUKAN "Magna Technology" (nama induk
 * perusahaan tidak pernah tampil ke klien di invoice manapun).
 *
 * ROMBAK BERIKUTNYA ("rombak total design invoice, ambil semuanya dari
 * sini serta isi fungsinya juga ditambah sesuaikan dengan invoice ini") —
 * layout diubah total mengikuti PERSIS contoh proforma invoice Magnarent
 * (INV/MGR/2026/09/003) yang dikirim Owner: blok DARI dengan PIC & WA
 * pengirim, DITAGIHKAN KEPADA dengan detail acara, DETAIL tiga kolom
 * lengkap (Tgl Acara/Loading/Durasi/Pengiriman), baris item dengan
 * sub-keterangan, blok totals bertingkat (Subtotal → Ongkos Kirim → TOTAL
 * → Deposit → TOTAL DIBAYARKAN), kotak METODE PEMBAYARAN + peringatan, dan
 * SYARAT & KETENTUAN bernomor. Semua field baru OPSIONAL (lihat
 * src/lib/invoices/types.ts + migrasi 0058) — kalau staf tidak mengisinya,
 * baris/blok terkait otomatis disembunyikan alih-alih menampilkan data
 * kosong/rekaan.
 */
const DIVISION_INFO: Record<InvoiceDivision, { label: string; tagline: string; logo: string }> = {
  magnarent: { label: "Magnarent", tagline: "Sewa Peralatan Event", logo: "magnarent-logo.png" },
  magnative: { label: "Magnativ", tagline: "Event Organizer & Creative Agency", logo: "magnativ-logo.png" },
  production: { label: "Production", tagline: "Produksi Booth & Konstruksi", logo: "production-logo.png" },
};

/**
 * ROMBAK Update 3 ("untuk list hitam ganti dengan warna pada logo jadi
 * menyesuaikan, jika magnativ hijau ya hijau listnya gitu") — bar/aksen
 * yang sebelumnya HARDCODE hitam (`#18181b`) di header tabel, bar TOTAL,
 * dan garis METODE PEMBAYARAN sekarang ikut warna dominan logo
 * masing-masing divisi. Warna diambil langsung dari sampling piksel logo
 * asli (public/brand/*.png):
 *  - Magnarent → navy `#292f3f` (warna dominan logo, BUKAN merah
 *    aksennya — merah `#ff4d4d` gagal kontras WCAG AA untuk teks putih di
 *    atasnya, sedangkan navy nyaris identik dengan hitam lama & tetap
 *    kontras tinggi 13.35:1).
 *  - Magnativ → hijau tosca `#047763` (warna dominan logo, kontras putih
 *    5.49:1, lolos AA).
 *  - Production → emas `#d4af37` (warna dominan logo). Emas TIDAK lolos
 *    kontras dengan teks putih (2.10:1, gagal AA) — jadi khusus Production
 *    teks di atas bar memakai warna gelap (`#18181b`, kontras 9.99:1)
 *    alih-alih putih.
 */
const ACCENT_INFO: Record<InvoiceDivision, { bar: string; onBar: string }> = {
  magnarent: { bar: "#292f3f", onBar: "#ffffff" },
  magnative: { bar: "#047763", onBar: "#ffffff" },
  production: { bar: "#d4af37", onBar: "#18181b" },
};

/**
 * Status invoice dipetakan ke label + warna ala template yang dikirim
 * pemilik (kolom "Status: BELUM LUNAS" berwarna merah) — "Terkirim" di
 * skema kita secara makna sama dengan "sudah dikirim ke klien, belum
 * dibayar", jadi labelnya dipakai sama persis: "BELUM LUNAS".
 */
const STATUS_INFO: Record<InvoiceStatus, { label: string; color: string }> = {
  Draft: { label: "DRAFT", color: "#71717a" },
  Terkirim: { label: "BELUM LUNAS", color: "#dc2626" },
  Lunas: { label: "LUNAS", color: "#16a34a" },
};

/**
 * Baca file logo divisi dari /public/brand langsung dari disk — aman
 * karena route pemanggilnya (`/api/invoices/[id]/pdf`) sudah dipaksa jalan
 * di Node.js runtime (bukan Edge), bukan di browser. Kalau filenya somehow
 * tidak ada, invoice tetap dirender tanpa logo alih-alih gagal total.
 */
function readDivisionLogo(division: InvoiceDivision): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "brand", DIVISION_INFO[division].logo));
  } catch {
    return null;
  }
}

/**
 * ROMBAK Update 3 ("untuk tanda tangan pada angelli ambil dari tanda
 * tangan yang saya kirimkan di contoh") — gambar tanda tangan ASLI
 * (di-crop langsung dari PDF contoh yang dikirim Owner, lengkap dengan
 * transparansi aslinya) dipakai kalau PIC penandatangan invoice adalah
 * Angellie. Nama PIC lain TIDAK dipetakan ke gambar apa pun (kita belum
 * punya file tanda tangan asli mereka) — otomatis jatuh balik ke simulasi
 * teks miring seperti sebelumnya, alih-alih memakai gambar tanda tangan
 * orang lain secara keliru.
 */
function readSignatureImage(picName: string | undefined): Buffer | null {
  if (!picName) return null;
  const normalized = picName.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized.startsWith("angel")) return null;
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "signatures", "angellie.png"));
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  // Logo per divisi (public/brand/*.png) SUDAH memuat wordmark lengkap
  // (mis. "magnativ"/"magnarent" ikut tergambar di file-nya sendiri) — jadi
  // logo di sini SENGAJA berdiri sendiri, diperbesar, tanpa nama divisi
  // ditulis ulang sebagai Text terpisah (dulu dobel/redundan). Tagline
  // ditaruh DI BAWAH logo, bukan di sampingnya, mengikuti template.
  brandCol: { flexDirection: "column", alignItems: "flex-start" },
  logo: { width: 132, marginBottom: 6, objectFit: "contain" },
  brandSub: { fontSize: 8.5, color: "#71717a" },
  invoiceTitle: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  invoiceDocLabel: { fontSize: 8.5, fontWeight: 700, color: "#dc2626", textAlign: "right", marginTop: 2 },
  invoiceSubtitle: { fontSize: 9, color: "#71717a", textAlign: "right", marginTop: 2 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 13 },
  metaBlock: { flex: 1, paddingRight: 10 },
  metaLabel: { fontSize: 7.5, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  metaValue: { fontSize: 10, fontWeight: 700 },
  metaLine: { fontSize: 9, color: "#3f3f46", marginTop: 2 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  detailKey: { fontSize: 8.5, color: "#71717a" },
  detailValue: { fontSize: 8.5, fontWeight: 700, textAlign: "right" },

  noteBox: {
    backgroundColor: "#fef2f2",
    borderLeftWidth: 3,
    borderLeftColor: "#dc2626",
    borderLeftStyle: "solid",
    borderRadius: 3,
    padding: 8,
    marginBottom: 13,
  },
  noteLabel: { fontWeight: 700 },
  noteText: { fontSize: 8.5, color: "#3f3f46", lineHeight: 1.4 },

  table: { borderTopWidth: 1, borderTopColor: "#e4e4e7", borderTopStyle: "solid" },
  // backgroundColor TIDAK ditaruh di sini lagi — sekarang per-divisi lewat
  // ACCENT_INFO, di-override inline saat dipakai (lihat komentar di atas
  // ACCENT_INFO).
  tableHeadRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    borderBottomStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  // color TIDAK ditaruh di sini lagi — ikut ACCENT_INFO.onBar (putih atau
  // gelap tergantung kontras bar divisinya), di-override inline.
  th: { fontSize: 8, textTransform: "uppercase", fontWeight: 700 },
  colNo: { flex: 0.4 },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.3, textAlign: "right" },
  colSubtotal: { flex: 1.3, textAlign: "right" },
  itemNote: { fontSize: 7.5, color: "#a1a1aa", marginTop: 2 },
  priceUnitLabel: { fontSize: 7, color: "#a1a1aa" },

  totalsBlock: { marginTop: 13, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 240, justifyContent: "space-between", marginTop: 4 },
  totalsLabel: { fontSize: 9.5, color: "#71717a" },
  totalsValue: { fontSize: 9.5 },
  depositLabel: { fontSize: 9.5, color: "#dc2626" },
  depositValue: { fontSize: 9.5, fontWeight: 700, color: "#dc2626" },
  // backgroundColor & color TIDAK ditaruh di sini lagi — ikut ACCENT_INFO,
  // di-override inline (sama seperti tableHeadRow/th di atas).
  grandTotalRow: {
    flexDirection: "row",
    width: 240,
    justifyContent: "space-between",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
  grandTotalLabel: { fontSize: 10.5, fontWeight: 700 },
  grandTotalValue: { fontSize: 10.5, fontWeight: 700 },

  paymentRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, gap: 14 },
  // borderLeftColor TIDAK ditaruh di sini lagi — ikut ACCENT_INFO.bar,
  // di-override inline.
  paymentBox: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    backgroundColor: "#fafafa",
    borderRadius: 3,
    padding: 8,
  },
  paymentBoxLabel: { fontSize: 7.5, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  paymentBankName: { fontSize: 10, fontWeight: 700 },
  paymentLine: { fontSize: 8.5, color: "#3f3f46", marginTop: 2 },
  warnBox: {
    flex: 1,
    backgroundColor: "#fffbeb",
    borderLeftWidth: 3,
    borderLeftColor: "#d97706",
    borderLeftStyle: "solid",
    borderRadius: 3,
    padding: 8,
  },
  warnText: { fontSize: 8, color: "#78350f", lineHeight: 1.4 },

  // Diperkecil (dulu marginTop 26, gambar 70x109, teks skrip 24pt) — di
  // invoice dengan Syarat & Ketentuan yang sekarang otomatis terisi
  // (DEFAULT_INVOICE_TERMS di InvoiceManager.tsx), blok tanda tangan yang
  // sebelumnya kebesaran ini bikin invoice yang tadinya pas 1 halaman jadi
  // meluber ke halaman ke-2. Diperkecil supaya tetap muat 1 lembar.
  signatureBlock: { marginTop: 14, alignItems: "flex-end" },
  signatureLabel: { fontSize: 9, color: "#71717a" },
  signatureDivision: { fontSize: 9.5, fontWeight: 700, marginTop: 3 },
  // "Tanda tangan" — tanpa file gambar tanda tangan asli, dipakai nama PIC
  // digambar besar & miring ala tulisan tangan (font standar PDF, tanpa
  // perlu registrasi font baru), lalu nama cetak tebal kecil di bawahnya
  // sebagai konfirmasi — pola sama seperti tanda tangan + nama di bawahnya
  // pada template referensi.
  signatureScript: { fontSize: 17, fontStyle: "italic", marginTop: 8, marginBottom: 2 },
  // Dipakai kalau readSignatureImage() berhasil menemukan file gambar
  // tanda tangan asli (saat ini: Angellie) — aspect ratio gambar aslinya
  // 349:543 (dari crop PDF contoh) dipertahankan di ukuran yang lebih
  // kecil (dulu 70pt lebar/109pt tinggi).
  signatureImage: { width: 52, height: 81, marginTop: 4, marginBottom: -4, objectFit: "contain" },
  signaturePic: { fontSize: 9, fontWeight: 700, marginTop: 2 },
  signatureBlank: { height: 18 },

  termsBlock: { marginTop: 14 },
  termsTitle: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  termsRow: { flexDirection: "row", marginTop: 3 },
  termsNo: { fontSize: 8, color: "#71717a", width: 14 },
  termsText: { fontSize: 8, color: "#3f3f46", flex: 1, lineHeight: 1.4 },

  footer: { position: "absolute", bottom: 32, left: 40, right: 40, fontSize: 8, color: "#a1a1aa", textAlign: "center" },
});

/**
 * Template invoice — dirender lewat @react-pdf/renderer (bukan HTML-ke-PDF)
 * supaya bisa jalan di Vercel serverless tanpa perlu browser headless
 * (Puppeteer dkk terlalu berat/rewel di lingkungan serverless).
 *
 * Dipakai dari dua tempat dengan tujuan berbeda (lihat `renderInvoicePdf`
 * di bawah): stream langsung untuk tombol "Download PDF", atau di-upload ke
 * Supabase Storage dulu untuk dapat URL publik sebelum dikirim ke webhook
 * n8n (tombol "Kirim WA").
 */
function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const division = DIVISION_INFO[invoice.division];
  const accent = ACCENT_INFO[invoice.division];
  const status = STATUS_INFO[invoice.status];
  const logoBuffer = readDivisionLogo(invoice.division);
  const signatureBuffer = readSignatureImage(invoice.picName);
  const totalDibayarkan = invoice.total + (invoice.depositAmount || 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brandCol}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> @react-pdf/renderer tidak punya atribut alt (bukan <img> HTML) */}
            {logoBuffer && <Image src={{ data: logoBuffer, format: "png" }} style={styles.logo} />}
            <Text style={styles.brandSub}>{division.tagline}</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            {invoice.documentLabel && <Text style={styles.invoiceDocLabel}>{invoice.documentLabel}</Text>}
            <Text style={styles.invoiceSubtitle}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Dari</Text>
            <Text style={styles.metaValue}>{division.label}</Text>
            {invoice.picName && <Text style={styles.metaLine}>a.n. {invoice.picName}</Text>}
            {invoice.picPhone && <Text style={styles.metaLine}>WA: {invoice.picPhone}</Text>}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Ditagihkan Kepada</Text>
            <Text style={styles.metaValue}>{invoice.clientName}</Text>
            {invoice.eventName && <Text style={styles.metaLine}>Event: {invoice.eventName}</Text>}
            {invoice.eventLocation && <Text style={styles.metaLine}>{invoice.eventLocation}</Text>}
            {invoice.clientPhone && <Text style={styles.metaLine}>{invoice.clientPhone}</Text>}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Detail</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>No.</Text>
              <Text style={styles.detailValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Tanggal</Text>
              <Text style={styles.detailValue}>{formatDateID(invoice.issuedDate)}</Text>
            </View>
            {invoice.eventDateLabel && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Tgl Acara</Text>
                <Text style={styles.detailValue}>{invoice.eventDateLabel}</Text>
              </View>
            )}
            {invoice.loadingInfo && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Loading</Text>
                <Text style={styles.detailValue}>{invoice.loadingInfo}</Text>
              </View>
            )}
            {invoice.durationLabel && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Durasi</Text>
                <Text style={styles.detailValue}>{invoice.durationLabel}</Text>
              </View>
            )}
            {invoice.deliveryMethod && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Pengiriman</Text>
                <Text style={styles.detailValue}>{invoice.deliveryMethod}</Text>
              </View>
            )}
            {invoice.dueDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Jatuh Tempo</Text>
                <Text style={styles.detailValue}>{formatDateID(invoice.dueDate)}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Status</Text>
              <Text style={[styles.detailValue, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>

        {invoice.catatan && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              <Text style={styles.noteLabel}>Catatan: </Text>
              {invoice.catatan}
            </Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={[styles.tableHeadRow, { backgroundColor: accent.bar }]}>
            <Text style={[styles.th, styles.colNo, { color: accent.onBar }]}>No</Text>
            <Text style={[styles.th, styles.colDesc, { color: accent.onBar }]}>Deskripsi</Text>
            <Text style={[styles.th, styles.colQty, { color: accent.onBar }]}>Qty</Text>
            <Text style={[styles.th, styles.colPrice, { color: accent.onBar }]}>Harga Satuan</Text>
            <Text style={[styles.th, styles.colSubtotal, { color: accent.onBar }]}>Subtotal</Text>
          </View>
          {invoice.items.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.colNo}>{i + 1}</Text>
              <View style={styles.colDesc}>
                <Text>{item.description}</Text>
                {item.note && <Text style={styles.itemNote}>{item.note}</Text>}
              </View>
              <Text style={styles.colQty}>{item.qtyLabel || item.qty}</Text>
              <View style={styles.colPrice}>
                <Text>{formatRupiah(item.unitPrice)}</Text>
                {item.unitLabel && <Text style={styles.priceUnitLabel}>/{item.unitLabel}</Text>}
              </View>
              <Text style={styles.colSubtotal}>{formatRupiah(item.subtotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatRupiah(invoice.subtotal)}</Text>
          </View>
          {invoice.shippingCost > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Ongkos Kirim{invoice.deliveryMethod ? ` ${invoice.deliveryMethod}` : ""}
              </Text>
              <Text style={styles.totalsValue}>{formatRupiah(invoice.shippingCost)}</Text>
            </View>
          )}
          <View style={[styles.grandTotalRow, { backgroundColor: accent.bar }]}>
            <Text style={[styles.grandTotalLabel, { color: accent.onBar }]}>TOTAL</Text>
            <Text style={[styles.grandTotalValue, { color: accent.onBar }]}>{formatRupiah(invoice.total)}</Text>
          </View>
          {invoice.depositAmount > 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.depositLabel}>{invoice.depositLabel || "Deposit"}</Text>
                <Text style={styles.depositValue}>{formatRupiah(invoice.depositAmount)}</Text>
              </View>
              <View style={[styles.grandTotalRow, { backgroundColor: accent.bar }]}>
                <Text style={[styles.grandTotalLabel, { color: accent.onBar }]}>TOTAL DIBAYARKAN</Text>
                <Text style={[styles.grandTotalValue, { color: accent.onBar }]}>{formatRupiah(totalDibayarkan)}</Text>
              </View>
            </>
          )}
        </View>

        {(invoice.bankName || invoice.paymentNote) && (
          <View style={styles.paymentRow}>
            {invoice.bankName && (
              <View style={[styles.paymentBox, { borderLeftColor: accent.bar }]}>
                <Text style={styles.paymentBoxLabel}>Metode Pembayaran</Text>
                <Text style={styles.paymentBankName}>{invoice.bankName}</Text>
                {invoice.bankAccountHolder && <Text style={styles.paymentLine}>a.n. {invoice.bankAccountHolder}</Text>}
                {invoice.bankAccountNumber && (
                  <Text style={styles.paymentLine}>No. Rek: {invoice.bankAccountNumber}</Text>
                )}
              </View>
            )}
            {invoice.paymentNote && (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>⚠ {invoice.paymentNote}</Text>
              </View>
            )}
          </View>
        )}

        {/* Syarat & Ketentuan SEBELUM tanda tangan (urutan dokumen resmi yang
            wajar — pihak menandatangani SETELAH membaca ketentuan, bukan
            sebaliknya). Dulu urutannya terbalik (tanda tangan dulu baru
            syarat), ditukar sekalian dengan pengecilan blok tanda tangan di
            atas supaya invoice tetap muat 1 halaman. */}
        {invoice.termsConditions && (
          <View style={styles.termsBlock}>
            <Text style={styles.termsTitle}>Syarat &amp; Ketentuan</Text>
            {invoice.termsConditions
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => (
                <View style={styles.termsRow} key={i}>
                  <Text style={styles.termsNo}>{i + 1}.</Text>
                  <Text style={styles.termsText}>{line}</Text>
                </View>
              ))}
          </View>
        )}

        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>Hormat Kami,</Text>
          <Text style={styles.signatureDivision}>{division.label}</Text>
          {signatureBuffer ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> @react-pdf/renderer tidak punya atribut alt (bukan <img> HTML) */}
              <Image src={{ data: signatureBuffer, format: "png" }} style={styles.signatureImage} />
              <Text style={styles.signaturePic}>{invoice.picName}</Text>
            </>
          ) : invoice.picName ? (
            <>
              <Text style={styles.signatureScript}>{invoice.picName}</Text>
              <Text style={styles.signaturePic}>{invoice.picName}</Text>
            </>
          ) : (
            <View style={styles.signatureBlank} />
          )}
        </View>

        <Text style={styles.footer}>
          {division.label.toUpperCase()} · {division.tagline}
          {invoice.picPhone ? ` · WA ${invoice.picPhone}` : ""} — Invoice ini dibuat otomatis oleh MagnaSuperApp
        </Text>
      </Page>
    </Document>
  );
}

/** Render invoice jadi Buffer PDF — dipakai baik untuk stream download maupun upload ke Storage. */
export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} />);
}
