import fs from "fs";
import path from "path";
import { Document, Page, StyleSheet, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";
import { formatDateID, todayISO } from "@/lib/magnarent/date";
import { calculateBookingTotal, countDaysInclusive, formatRupiah } from "@/lib/magnarent/pricing";
import type { Booking, InventoryItem } from "@/lib/magnarent/types";
import type { BookingDeposit } from "@/lib/magnarent/extras-types";

/**
 * Surat Perjanjian Sewa Alat (Tahap 45 — gap #4 analisis-gap-magnarent.md,
 * prioritas tinggi tapi bisa langsung dikerjakan TANPA bahan eksternal):
 * auto-generate dari data booking yang sudah ada, TANPA tanda tangan
 * digital sah hukum (itu butuh keputusan Owner soal e-signature, dicatat
 * di bahan-diperlukan.md) — dicetak lalu ditandatangani manual/discan,
 * sama seperti alur lama sebelum aplikasi ada. Dirender lewat
 * @react-pdf/renderer, pola SAMA PERSIS dengan src/lib/invoices/pdf.tsx
 * (bukan HTML-ke-PDF, supaya jalan di Vercel serverless tanpa Puppeteer).
 */
function readMagnarentLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "brand", "magnarent-logo.png"));
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { width: 120, objectFit: "contain" },
  docTitle: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  docSubtitle: { fontSize: 8.5, color: "#71717a", textAlign: "right", marginTop: 2 },

  introText: { fontSize: 9, lineHeight: 1.5, marginBottom: 14, textAlign: "justify" },

  partiesRow: { flexDirection: "row", gap: 14, marginBottom: 16 },
  partyBox: { flex: 1, borderWidth: 1, borderColor: "#e4e4e7", borderStyle: "solid", borderRadius: 4, padding: 10 },
  partyLabel: { fontSize: 7.5, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  partyName: { fontSize: 10.5, fontWeight: 700 },
  partyLine: { fontSize: 8.5, color: "#3f3f46", marginTop: 2 },

  sectionTitle: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },

  table: { borderTopWidth: 1, borderTopColor: "#e4e4e7", borderTopStyle: "solid", marginBottom: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    borderBottomStyle: "solid",
    paddingVertical: 5,
  },
  tKey: { flex: 1.3, fontSize: 8.5, color: "#71717a" },
  tVal: { flex: 2, fontSize: 8.5, fontWeight: 700, textAlign: "right" },

  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    backgroundColor: "#18181b",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
  },
  grandTotalLabel: { fontSize: 10, fontWeight: 700, color: "#ffffff" },
  grandTotalValue: { fontSize: 10, fontWeight: 700, color: "#ffffff" },

  depositBox: {
    marginTop: 14,
    backgroundColor: "#fafafa",
    borderLeftWidth: 3,
    borderLeftColor: "#18181b",
    borderLeftStyle: "solid",
    borderRadius: 3,
    padding: 10,
  },
  depositText: { fontSize: 8.5, color: "#3f3f46", lineHeight: 1.4 },

  termsBlock: { marginTop: 16 },
  termsRow: { flexDirection: "row", marginTop: 3 },
  termsNo: { fontSize: 8, color: "#71717a", width: 14 },
  termsText: { fontSize: 8, color: "#3f3f46", flex: 1, lineHeight: 1.4 },

  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 32 },
  signatureCol: { width: 200, alignItems: "center" },
  signatureLabel: { fontSize: 8.5, color: "#71717a" },
  signatureName: { fontSize: 9, fontWeight: 700, marginTop: 2 },
  signatureLine: { marginTop: 44, borderTopWidth: 1, borderTopColor: "#a1a1aa", borderTopStyle: "solid", width: "100%" },
  signatureCaption: { fontSize: 7.5, color: "#a1a1aa", marginTop: 4 },

  disclaimer: { position: "absolute", bottom: 28, left: 42, right: 42, fontSize: 7, color: "#a1a1aa", textAlign: "center", lineHeight: 1.4 },
});

const DEFAULT_TERMS = [
  "Penyewa (PIHAK KEDUA) bertanggung jawab penuh atas kondisi alat selama masa sewa berlangsung, sejak alat diserahterimakan sampai dikembalikan.",
  "Alat wajib dikembalikan pada tanggal yang tercantum di atas dalam kondisi baik dan lengkap. Keterlambatan pengembalian dikenakan biaya tambahan sesuai harga sewa per hari yang berlaku.",
  "Kerusakan atau kehilangan alat akibat kelalaian Penyewa menjadi tanggung jawab Penyewa sepenuhnya, termasuk biaya perbaikan/penggantian.",
  "Jaminan (jika ada) akan dikembalikan setelah alat diperiksa dan dinyatakan dalam kondisi baik oleh PIHAK PERTAMA.",
  "Perjanjian ini berlaku sejak ditandatangani oleh kedua belah pihak dan berakhir setelah alat dikembalikan serta seluruh kewajiban pembayaran dilunasi.",
];

function ContractDocument({
  booking,
  item,
  deposit,
}: {
  booking: Booking;
  item: InventoryItem | undefined;
  deposit: BookingDeposit | null;
}) {
  const logoBuffer = readMagnarentLogo();
  const days = countDaysInclusive(booking.tanggalMulai, booking.tanggalSelesai);
  const total = calculateBookingTotal(booking, item);
  const totalDibayarkan = booking.statusPembayaran === "DP" ? booking.dpAmount : booking.statusPembayaran === "Lunas" ? total : 0;
  const sisaBayar = Math.max(total - totalDibayarkan, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> @react-pdf/renderer tidak punya atribut alt (bukan <img> HTML) */}
          {logoBuffer && <Image src={{ data: logoBuffer, format: "png" }} style={styles.logo} />}
          <View>
            <Text style={styles.docTitle}>SURAT PERJANJIAN SEWA ALAT</Text>
            <Text style={styles.docSubtitle}>No. Booking: {booking.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.docSubtitle}>Tanggal Dibuat: {formatDateID(todayISO())}</Text>
          </View>
        </View>

        <Text style={styles.introText}>
          Perjanjian sewa-menyewa alat ini dibuat dan disepakati antara kedua belah pihak yang bertanda tangan di
          bawah ini, dengan ketentuan sebagaimana diatur dalam pasal-pasal berikut:
        </Text>

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Pihak Pertama (Pemberi Sewa)</Text>
            <Text style={styles.partyName}>Magnarent</Text>
            <Text style={styles.partyLine}>Divisi Sewa Peralatan Event — Magna Technology</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Pihak Kedua (Penyewa)</Text>
            <Text style={styles.partyName}>{booking.namaKlien}</Text>
            {booking.teleponKlien && <Text style={styles.partyLine}>{booking.teleponKlien}</Text>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Detail Sewa</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tKey}>Nama Alat</Text>
            <Text style={styles.tVal}>{item?.name ?? "—"}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tKey}>Kategori</Text>
            <Text style={styles.tVal}>{item?.category ?? "—"}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tKey}>Jumlah Unit</Text>
            <Text style={styles.tVal}>{booking.jumlahUnit} unit</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tKey}>Masa Sewa</Text>
            <Text style={styles.tVal}>
              {formatDateID(booking.tanggalMulai)} s/d {formatDateID(booking.tanggalSelesai)} ({days} hari)
            </Text>
          </View>
        </View>

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>TOTAL BIAYA SEWA</Text>
          <Text style={styles.grandTotalValue}>{formatRupiah(total)}</Text>
        </View>
        {totalDibayarkan > 0 && (
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tKey}>{booking.statusPembayaran === "Lunas" ? "Sudah Dibayar (Lunas)" : "DP Diterima"}</Text>
              <Text style={styles.tVal}>{formatRupiah(totalDibayarkan)}</Text>
            </View>
            {sisaBayar > 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.tKey}>Sisa Pembayaran</Text>
                <Text style={styles.tVal}>{formatRupiah(sisaBayar)}</Text>
              </View>
            )}
          </View>
        )}

        {deposit && (
          <View style={styles.depositBox}>
            <Text style={styles.depositText}>
              <Text style={{ fontWeight: 700 }}>Jaminan: </Text>
              {deposit.jenis}
              {deposit.jumlah > 0 ? ` — ${formatRupiah(deposit.jumlah)}` : ""}
              {deposit.keterangan ? ` (${deposit.keterangan})` : ""}. Status:{" "}
              {deposit.dikembalikan ? "sudah dikembalikan." : "belum dikembalikan, ditahan PIHAK PERTAMA sampai alat kembali."}
            </Text>
          </View>
        )}

        <View style={styles.termsBlock}>
          <Text style={styles.sectionTitle}>Syarat &amp; Ketentuan</Text>
          {DEFAULT_TERMS.map((line, i) => (
            <View style={styles.termsRow} key={i}>
              <Text style={styles.termsNo}>{i + 1}.</Text>
              <Text style={styles.termsText}>{line}</Text>
            </View>
          ))}
        </View>

        <View style={styles.signatureRow}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>Pihak Pertama,</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>Magnarent</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>Pihak Kedua,</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{booking.namaKlien}</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Dokumen ini dibuat otomatis oleh MagnaSuperApp berdasarkan data booking — belum ditandatangani secara
          digital. Cetak dan tandatangani lembar ini secara manual oleh kedua pihak agar berlaku sah.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderBookingContractPdf(
  booking: Booking,
  item: InventoryItem | undefined,
  deposit: BookingDeposit | null
): Promise<Buffer> {
  return renderToBuffer(<ContractDocument booking={booking} item={item} deposit={deposit} />);
}
