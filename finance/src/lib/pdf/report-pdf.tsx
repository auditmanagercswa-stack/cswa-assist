import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Cell, ReportDoc } from "@/lib/reports/types";
import { headingFont } from "./fonts";

const money = (p: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p / 100);
const text = (c: Cell, isMoney?: boolean) => c == null ? "" : typeof c === "number" ? (isMoney ? money(c) : String(c)) : typeof c === "string" ? c : c.money != null ? `${money(c.money)} ${c.text}` : c.text;

/** Generic report PDF: Book Antiqua (or Times) headings, company & period, page numbers. Amounts in Rs. */
export function ReportPdf({ doc }: { doc: ReportDoc }) {
  const H = headingFont();
  const wide = doc.sections.some((s) => s.columns.length > 6);
  const s = StyleSheet.create({
    page: { padding: 32, paddingBottom: 44, fontSize: 8, fontFamily: "Helvetica", color: "#0F1B33" },
    title: { fontFamily: H, fontSize: 18, color: "#1F3A93" },
    sub: { color: "#5f6661", marginTop: 2 },
    rule: { height: 2, backgroundColor: "#2563EB", marginVertical: 10, width: 60 },
    h2: { fontFamily: H, fontSize: 11, marginTop: 10, marginBottom: 4, color: "#1F3A93" },
    th: { padding: 4, backgroundColor: "#E8F0FE", fontFamily: "Helvetica-Bold", fontSize: 7 },
    td: { padding: 4, borderBottomWidth: 0.4, borderBottomColor: "#E3E8F2" },
    footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#8b8f88" },
  });
  return (
    <Document title={`${doc.title} — ${doc.company}`} author={doc.company}>
      <Page size="A4" orientation={wide ? "landscape" : "portrait"} style={s.page}>
        <Text style={s.title}>{doc.title}</Text>
        <Text style={s.sub}>{doc.company} · {doc.period} · amounts in Rs.</Text>
        <View style={s.rule} />
        {doc.kpis && <View style={{ flexDirection: "row", gap: 16, marginBottom: 6 }}>{doc.kpis.map((k) => <View key={k.label}><Text style={{ color: "#5f6661" }}>{k.label}</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{money(k.value)}</Text></View>)}</View>}
        {doc.sections.map((sec, i) => {
          const w = sec.columns.map((c, j) => (c.money || c.align === "right" ? 1 : j === 0 ? 2.4 : 1.4));
          const tot = w.reduce((a, b) => a + b, 0);
          const width = (j: number) => `${(w[j] / tot) * 100}%`;
          return (
            <View key={i}>
              {sec.heading && <Text style={s.h2}>{sec.heading}</Text>}
              <View style={{ flexDirection: "row" }} fixed>{sec.columns.map((c, j) => <Text key={j} style={[s.th, { width: width(j), textAlign: c.money || c.align === "right" ? "right" : "left" }]}>{c.label}</Text>)}</View>
              {sec.rows.map((r, j) => (
                <View key={j} style={{ flexDirection: "row", backgroundColor: r.tone === "total" ? "#F5F8FF" : r.tone === "heading" ? "#F5F8FF" : undefined }} wrap={false}>
                  {r.cells.map((c, k) => <Text key={k} style={[s.td, { width: width(k), textAlign: sec.columns[k]?.money || sec.columns[k]?.align === "right" ? "right" : "left", fontFamily: r.tone === "total" || r.tone === "heading" || r.tone === "subtotal" ? "Helvetica-Bold" : "Helvetica", color: r.tone === "muted" ? "#8b8f88" : "#0F1B33" }]}>{text(c, sec.columns[k]?.money)}</Text>)}
                </View>
              ))}
            </View>
          );
        })}
        {doc.footnote && <Text style={{ marginTop: 10, color: "#8b8f88" }}>{doc.footnote}</Text>}
        <View style={s.footer} fixed>
          <Text>{doc.company} · {doc.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
