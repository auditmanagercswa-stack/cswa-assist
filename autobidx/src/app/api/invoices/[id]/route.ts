import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { getInvoicePdf } from "@/server/services/documents";

export const GET = route<{ id: string }>(async ({ params, actor }) => {
  const f = await getInvoicePdf(params.id, requireActor(actor));
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${f.filename}"`, "Cache-Control": "private, no-store" } });
});
