import { errorResponse } from "@/server/http";
import { handleWebhook } from "@/server/services/payments";

export const runtime = "nodejs";

/** Provider webhooks. Authenticated by the provider's HMAC signature (not cookies), so no CSRF check. */
export async function POST(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  if (!/^[a-z_]{2,20}$/.test(gateway)) return new Response("Not found", { status: 404 });
  try {
    const raw = await req.text();
    if (raw.length > 256_000) return new Response("Payload too large", { status: 413 });
    const result = await handleWebhook(gateway, raw, req.headers);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
