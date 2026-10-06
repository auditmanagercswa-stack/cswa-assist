import { prisma } from "@/lib/db";
import { getActorFromRequest } from "@/server/auth/session";
import { auctionSnapshot } from "@/server/services/auctions";
import { subscribe, type RealtimeEvent } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream for one auction. The server stays authoritative: every event carries
 * server-computed state and the current server time; clients just render it.
 * (SSE is used instead of WebSockets: one-way, proxy/CDN friendly, auto-reconnects.)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = await prisma.auction.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return new Response("Not found", { status: 404 });
  const actor = await getActorFromRequest(req);
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
      send("snapshot", await auctionSnapshot(id, actor?.userId));
      let pending: NodeJS.Timeout | null = null;
      const unsubscribe = await subscribe((e: RealtimeEvent) => {
        if (!("auctionId" in e) || e.auctionId !== id) return;
        send(e.type, { ...e.data, serverTime: new Date().toISOString() });
        // Signed-in viewers get a personalised snapshot (leader flags, my auto-bid), debounced.
        // Anonymous viewers apply the pushed delta only, so a popular auction costs no extra queries per viewer.
        if (!actor && e.type === "auction.bid") return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(async () => send("snapshot", await auctionSnapshot(id, actor?.userId)), 150);
      });
      const heartbeat = setInterval(() => send("ping", { serverTime: new Date().toISOString() }), 20_000);
      cleanup = () => {
        clearInterval(heartbeat);
        if (pending) clearTimeout(pending);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
