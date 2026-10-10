import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { verifyId } from "@/lib/share";
import { invoiceData } from "@/lib/invoice-data";
import { InvoicePdf } from "@/lib/pdf/invoice-pdf";

/** Public, signed link to one invoice PDF (for WhatsApp/email sharing). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyId("invoice", id, new URL(req.url).searchParams.get("sig"))) return new Response("This link is invalid or has been changed.", { status: 403 });
  const inv = await db.invoice.findUnique({ where: { id }, select: { companyId: true } });
  const data = inv && (await invoiceData(inv.companyId, id));
  if (!data) return new Response("Not found", { status: 404 });
  const buf = await renderToBuffer(InvoicePdf({ d: data.pdf }));
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${data.inv.number.replace(/\//g, "-")}.pdf"`, "cache-control": "private, no-store" } });
}
