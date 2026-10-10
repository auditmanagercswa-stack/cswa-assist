import { getCtx } from "@/lib/session";
import { ADAPTERS } from "@/lib/sync/tally";

/** GET /api/sync/tally?what=masters|vouchers|all → Tally XML download. */
export async function GET(req: Request, { params }: { params: Promise<{ adapter: string }> }) {
  const ctx = await getCtx();
  const { adapter } = await params;
  const a = ADAPTERS.find((x) => x.id === adapter);
  if (!a?.exportData) return new Response("Export not available for this source yet.", { status: 404 });
  const what = new URL(req.url).searchParams.get("what");
  const out = await a.exportData(ctx, what === "masters" || what === "vouchers" ? what : "all");
  return new Response(out.body, { headers: { "content-type": out.mime, "content-disposition": `attachment; filename="${out.filename}"` } });
}
