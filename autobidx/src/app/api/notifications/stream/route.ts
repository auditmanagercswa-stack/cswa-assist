import { getActorFromRequest } from "@/server/auth/session";
import { subscribe } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Per-user realtime notifications (outbid, won, offers…). */
export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send("ready", { ok: true });
      const unsubscribe = await subscribe((e) => {
        if (e.type === "user.notification" && e.userId === actor.userId) send("notification", e.data);
      });
      const hb = setInterval(() => send("ping", {}), 25_000);
      cleanup = () => {
        clearInterval(hb);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* noop */
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
