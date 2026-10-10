import { renderToBuffer } from "@react-pdf/renderer";
import { getCtx } from "@/lib/session";
import { invoiceData } from "@/lib/invoice-data";
import { InvoicePdf } from "@/lib/pdf/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const data = await invoiceData(ctx.company.id, (await params).id);
  if (!data) return new Response("Not found", { status: 404 });
  const buf = await renderToBuffer(InvoicePdf({ d: data.pdf }));
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${data.inv.number.replace(/\//g, "-")}.pdf"` } });
}
