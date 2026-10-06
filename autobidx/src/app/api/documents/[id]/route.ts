import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { getOrderDocument } from "@/server/services/documents";

export const GET = route<{ id: string }>(async ({ params, actor, req }) => {
  const f = await getOrderDocument(params.id, requireActor(actor));
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.filename}"`, "Cache-Control": "private, no-store" },
  });
});
