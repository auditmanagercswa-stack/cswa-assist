import { renderToBuffer } from "@react-pdf/renderer";
import { getCtx } from "@/lib/session";
import { buildReport } from "@/lib/reports/builders";
import { ReportPdf } from "@/lib/pdf/report-pdf";
import { reportToXlsx } from "@/lib/export/xlsx";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getCtx();
  const url = new URL(req.url);
  const doc = await buildReport((await params).type, ctx, { ledger: url.searchParams.get("ledger") ?? undefined, layout: url.searchParams.get("layout") ?? undefined });
  if (!doc) return new Response("Report not found", { status: 404 });
  const name = `${ctx.company.name} ${doc.title} ${ctx.period.label}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_");
  if (url.searchParams.get("format") === "xlsx") {
    return new Response(new Uint8Array(await reportToXlsx(doc)), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` } });
  }
  const buf = await renderToBuffer(ReportPdf({ doc }));
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"` } });
}
