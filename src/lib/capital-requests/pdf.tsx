import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDateID, formatRupiah, isoDateInJakarta } from "@/lib/shared/utils";
import type { CapitalRequest } from "./types";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  brand: { fontSize: 18, fontWeight: 700 },
  brandSub: { fontSize: 9, color: "#71717a", marginTop: 2 },
  reportTitle: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  reportMeta: { fontSize: 8.5, color: "#71717a", textAlign: "right", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 10,
  },
  statLabel: { fontSize: 7.5, color: "#a1a1aa", textTransform: "uppercase" },
  statValue: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 8 },
  table: { borderTopWidth: 1, borderTopColor: "#e4e4e7", borderTopStyle: "solid" },
  tableHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    borderBottomStyle: "solid",
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    borderBottomStyle: "solid",
    paddingVertical: 6,
  },
  th: { fontSize: 7.5, color: "#71717a", textTransform: "uppercase" },
  colEvent: { flex: 2.2 },
  colTanggal: { flex: 1.1 },
  colModal: { flex: 1.2, textAlign: "right" },
  colBilling: { flex: 1.2, textAlign: "right" },
  colStatus: { flex: 1 },
  colBukti: { flex: 0.9, textAlign: "center" },
  catatan: { fontSize: 8, color: "#71717a", marginTop: 2 },
  footer: { position: "absolute", bottom: 32, left: 40, right: 40, fontSize: 8, color: "#a1a1aa", textAlign: "center" },
});

/**
 * Laporan PDF self-service untuk investor (Tahap 28d) — "ekspor laporan PDF
 * sendiri", artinya investor tidak perlu minta Admin buatkan, tinggal klik
 * "Unduh Laporan PDF" di halaman Pengajuan Modal. Isinya ringkasan + seluruh
 * riwayat pengajuan modal (bukan cuma yang sudah diputuskan), sama seperti
 * yang investor lihat di layar, supaya laporan ini bisa jadi arsip/dibagikan
 * tanpa harus screenshot. Dirender lewat @react-pdf/renderer, pola & style
 * sama dengan `renderInvoicePdf` (src/lib/invoices/pdf.tsx) supaya konsisten
 * dan sudah terbukti jalan di Vercel serverless.
 */
function CapitalRequestReportDocument({ requests, generatedAt }: { requests: CapitalRequest[]; generatedAt: string }) {
  const menunggu = requests.filter((r) => r.status === "Menunggu");
  const disetujui = requests.filter((r) => r.status === "Disetujui");
  const ditolak = requests.filter((r) => r.status === "Ditolak");
  const totalModalDisetujui = disetujui.reduce((sum, r) => sum + r.modalEstimate, 0);

  const sorted = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>Magna Technology</Text>
            <Text style={styles.brandSub}>Laporan Investor</Text>
          </View>
          <View>
            <Text style={styles.reportTitle}>PENGAJUAN MODAL</Text>
            <Text style={styles.reportMeta}>Dibuat {formatDateID(isoDateInJakarta(generatedAt))}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Pengajuan</Text>
            <Text style={styles.statValue}>{requests.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Menunggu</Text>
            <Text style={styles.statValue}>{menunggu.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Disetujui</Text>
            <Text style={styles.statValue}>{disetujui.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ditolak</Text>
            <Text style={styles.statValue}>{ditolak.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Modal Disetujui</Text>
            <Text style={styles.statValue}>{formatRupiah(totalModalDisetujui)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Riwayat Seluruh Pengajuan ({sorted.length})</Text>
        <View style={styles.table}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.th, styles.colEvent]}>Event</Text>
            <Text style={[styles.th, styles.colTanggal]}>Tanggal</Text>
            <Text style={[styles.th, styles.colBilling]}>Est. Pendapatan</Text>
            <Text style={[styles.th, styles.colModal]}>Modal</Text>
            <Text style={[styles.th, styles.colStatus]}>Status</Text>
            <Text style={[styles.th, styles.colBukti]}>Bukti Bayar</Text>
          </View>
          {sorted.map((r) => (
            <View style={styles.tableRow} key={r.id} wrap={false}>
              <View style={styles.colEvent}>
                <Text>{r.eventName}</Text>
                <Text style={styles.catatan}>{r.location || "Lokasi belum diisi"}</Text>
                {r.investorNote && <Text style={styles.catatan}>Catatan: &ldquo;{r.investorNote}&rdquo;</Text>}
              </View>
              <Text style={styles.colTanggal}>{r.eventDate ? formatDateID(r.eventDate) : "Belum pasti"}</Text>
              <Text style={styles.colBilling}>{formatRupiah(r.billingEstimate)}</Text>
              <Text style={styles.colModal}>{formatRupiah(r.modalEstimate)}</Text>
              <Text style={styles.colStatus}>{r.status}</Text>
              <Text style={styles.colBukti}>{r.status === "Disetujui" ? (r.paymentProofUrl ? "Ada" : "Belum") : "—"}</Text>
            </View>
          ))}
          {sorted.length === 0 && (
            <View style={styles.tableRow}>
              <Text>Belum ada pengajuan modal tercatat.</Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          Laporan ini dibuat otomatis oleh MagnaSuperApp untuk akun investor — Magna Technology
        </Text>
      </Page>
    </Document>
  );
}

export async function renderCapitalRequestReportPdf(requests: CapitalRequest[]): Promise<Buffer> {
  return renderToBuffer(<CapitalRequestReportDocument requests={requests} generatedAt={new Date().toISOString()} />);
}
