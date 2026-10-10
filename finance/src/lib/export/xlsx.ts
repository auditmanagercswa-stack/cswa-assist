import ExcelJS from "exceljs";
import type { Cell, ReportDoc } from "@/lib/reports/types";

/** Indian digit grouping (1,23,45,678.00) as an Excel number format. */
export const INR_FORMAT = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00';

const value = (c: Cell): string | number | null => c == null ? null : typeof c === "number" ? c / 100 : typeof c === "string" ? c : c.money != null ? c.money / 100 : c.text;

/** One worksheet per report: Book Antiqua title block, sand header rows, page numbers in the footer. */
export async function reportToXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.company;
  const ws = wb.addWorksheet(doc.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"), { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.headerFooter.oddFooter = `&L${doc.company}&RPage &P of &N`;
  const width = Math.max(...doc.sections.map((s) => s.columns.length));
  const title = ws.addRow([doc.title]); title.font = { name: "Book Antiqua", size: 16, bold: true, color: { argb: "FF1F3A93" } };
  const sub = ws.addRow([`${doc.company} · ${doc.period}`]); sub.font = { name: "Book Antiqua", size: 11, italic: true, color: { argb: "FF2563EB" } };
  ws.addRow([]);
  for (const k of doc.kpis ?? []) { const r = ws.addRow([k.label, k.value / 100]); r.getCell(2).numFmt = INR_FORMAT; r.font = { name: "Book Antiqua" }; }
  if (doc.kpis?.length) ws.addRow([]);
  for (const sec of doc.sections) {
    if (sec.heading) { const h = ws.addRow([sec.heading]); h.font = { name: "Book Antiqua", size: 12, bold: true, color: { argb: "FF1F3A93" } }; }
    const head = ws.addRow(sec.columns.map((c) => c.label));
    head.eachCell((c) => { c.font = { name: "Book Antiqua", bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } }; c.border = { bottom: { style: "thin", color: { argb: "FF2563EB" } } }; });
    for (const r of sec.rows) {
      const row = ws.addRow(r.cells.map(value));
      row.font = { name: "Book Antiqua", bold: r.tone === "total" || r.tone === "subtotal" || r.tone === "heading", color: { argb: r.tone === "muted" ? "FF8B8F88" : "FF0F1B33" } };
      sec.columns.forEach((c, i) => { if (c.money) { row.getCell(i + 1).numFmt = INR_FORMAT; row.getCell(i + 1).alignment = { horizontal: "right" }; } });
      if (r.tone === "total") row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FF" } }; c.border = { top: { style: "thin", color: { argb: "FF2563EB" } } }; });
    }
    ws.addRow([]);
  }
  if (doc.footnote) { const f = ws.addRow([doc.footnote]); f.font = { name: "Book Antiqua", italic: true, size: 9, color: { argb: "FF8B8F88" } }; }
  for (let i = 1; i <= width; i++) ws.getColumn(i).width = i === 1 ? 34 : 18;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
