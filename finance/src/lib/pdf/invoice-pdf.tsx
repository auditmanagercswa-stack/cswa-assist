import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { STATES } from "@/config/tax";
import { fmtDate } from "@/lib/format";
import { headingFont } from "./fonts";

// react-pdf's built-in fonts don't include ₹ — amounts use "Rs." in PDFs.
const rs = (p: number) => "Rs. " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p / 100);

export interface InvoicePdfData {
  company: { name: string; gstin: string | null; pan: string | null; address: string | null; email: string | null; phone: string | null; stateCode: string; upiId: string | null };
  party: { name: string; gstin: string | null; address: string | null; stateCode: string | null };
  invoice: { number: string; date: Date; dueDate: Date; placeOfSupply: string; interState: boolean; taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number; paid: number; notes: string | null; irn: string | null };
  items: { description: string; hsn: string | null; qty: number; unit: string; rate: number; gstRate: number; taxable: number }[];
  qrDataUrl: string | null;
  amountInWords: string;
}

export function InvoicePdf({ d }: { d: InvoicePdfData }) {
  const H = headingFont();
  const s = StyleSheet.create({
    page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#0F1B33" },
    band: { backgroundColor: "#1F3A93", color: "#FFFFFF", padding: 16, borderRadius: 8, flexDirection: "row", justifyContent: "space-between" },
    h1: { fontFamily: H, fontSize: 20, color: "#93C5FD" },
    co: { fontFamily: H, fontSize: 14 },
    muted: { color: "#5f6661" },
    row: { flexDirection: "row" },
    th: { backgroundColor: "#E8F0FE", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 8 },
    td: { padding: 5, borderBottomWidth: 0.5, borderBottomColor: "#E3E8F2" },
    right: { textAlign: "right" },
    box: { borderWidth: 0.5, borderColor: "#E3E8F2", borderRadius: 6, padding: 10, flex: 1 },
    footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#8b8f88" },
  });
  const cols = [{ w: "34%", k: "Description" }, { w: "11%", k: "HSN/SAC" }, { w: "9%", k: "Qty" }, { w: "14%", k: "Rate" }, { w: "10%", k: "GST" }, { w: "22%", k: "Taxable value" }];
  return (
    <Document title={`Invoice ${d.invoice.number}`} author={d.company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <View>
            <Text style={s.co}>{d.company.name}</Text>
            {d.company.address && <Text style={{ marginTop: 4, maxWidth: 260 }}>{d.company.address}</Text>}
            <Text style={{ marginTop: 4 }}>{d.company.gstin ? `GSTIN ${d.company.gstin}` : "Not GST registered"}{d.company.pan ? `  ·  PAN ${d.company.pan}` : ""}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Tax Invoice</Text>
            <Text style={{ marginTop: 4 }}>{d.invoice.number}</Text>
            <Text>Date {fmtDate(d.invoice.date)}</Text>
            <Text>Due {fmtDate(d.invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={[s.row, { gap: 10, marginTop: 14 }]}>
          <View style={s.box}>
            <Text style={[s.muted, { fontSize: 7, marginBottom: 3 }]}>BILL TO</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{d.party.name}</Text>
            {d.party.address && <Text>{d.party.address}</Text>}
            <Text>{d.party.gstin ? `GSTIN ${d.party.gstin}` : "Unregistered (B2C)"}</Text>
          </View>
          <View style={s.box}>
            <Text style={[s.muted, { fontSize: 7, marginBottom: 3 }]}>SUPPLY</Text>
            <Text>Place of supply: {d.invoice.placeOfSupply} · {STATES[d.invoice.placeOfSupply] ?? ""}</Text>
            <Text>{d.invoice.interState ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}</Text>
            <Text style={s.muted}>e-Invoice IRN: {d.invoice.irn ?? "not generated"}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={s.row}>{cols.map((c, i) => <Text key={c.k} style={[s.th, { width: c.w }, i >= 2 ? s.right : {}]}>{c.k}</Text>)}</View>
          {d.items.map((it, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={[s.td, { width: cols[0].w }]}>{it.description}</Text>
              <Text style={[s.td, { width: cols[1].w }]}>{it.hsn ?? "—"}</Text>
              <Text style={[s.td, s.right, { width: cols[2].w }]}>{it.qty} {it.unit}</Text>
              <Text style={[s.td, s.right, { width: cols[3].w }]}>{rs(it.rate)}</Text>
              <Text style={[s.td, s.right, { width: cols[4].w }]}>{it.gstRate}%</Text>
              <Text style={[s.td, s.right, { width: cols[5].w }]}>{rs(it.taxable)}</Text>
            </View>
          ))}
        </View>

        <View style={[s.row, { marginTop: 14, gap: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>Amount in words</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 8 }}>{d.amountInWords}</Text>
            {d.invoice.notes && <Text style={s.muted}>{d.invoice.notes}</Text>}
            {d.qrDataUrl && d.company.upiId && (
              <View style={[s.row, { marginTop: 10, alignItems: "center", gap: 8 }]}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={d.qrDataUrl} style={{ width: 72, height: 72 }} />
                <View><Text style={{ fontFamily: "Helvetica-Bold" }}>Scan to pay by UPI</Text><Text style={s.muted}>{d.company.upiId}</Text></View>
              </View>
            )}
          </View>
          <View style={{ width: 210 }}>
            {[["Taxable value", d.invoice.taxable], ...(d.invoice.interState ? [["IGST", d.invoice.igst]] : [["CGST", d.invoice.cgst], ["SGST", d.invoice.sgst]]), ...(d.invoice.roundOff ? [["Round off", d.invoice.roundOff]] : [])].map(([k, v]) => (
              <View key={k as string} style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}><Text style={s.muted}>{k}</Text><Text>{rs(v as number)}</Text></View>
            ))}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#2563EB", marginTop: 4, paddingTop: 5 }]}>
              <Text style={{ fontFamily: H, fontSize: 12 }}>Total</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{rs(d.invoice.total)}</Text>
            </View>
            {d.invoice.paid > 0 && <View style={[s.row, { justifyContent: "space-between" }]}><Text style={s.muted}>Balance due</Text><Text>{rs(d.invoice.total - d.invoice.paid)}</Text></View>}
          </View>
        </View>

        <Text style={{ marginTop: 28, textAlign: "right" }}>For {d.company.name}</Text>
        <Text style={[s.muted, { textAlign: "right", marginTop: 24 }]}>Authorised signatory</Text>

        <View style={s.footer} fixed>
          <Text>{d.company.name} · {d.invoice.number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
