import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { getPrivateFile } from "@/server/services/documents";

export const GET = route<{ id: string }>(async ({ actor, params }) => {
  const a = requireActor(actor);
  const f = await getPrivateFile(params.id, a);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
