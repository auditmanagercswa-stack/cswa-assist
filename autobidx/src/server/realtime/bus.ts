import { EventEmitter } from "events";
import { Client } from "pg";
import { prisma, type Db } from "@/lib/db";

/**
 * Realtime event bus built on Postgres LISTEN/NOTIFY.
 *  - publish() inside a transaction is delivered only if the transaction commits, so clients
 *    never see a bid that was rolled back.
 *  - Every web instance and the worker share the same channel, so it scales horizontally
 *    without extra infrastructure. Swap for Redis pub/sub if volumes demand it.
 */
const CHANNEL = "abx_events";

export type RealtimeEvent =
  | { type: "auction.update"; auctionId: string; data: Record<string, unknown> }
  | { type: "auction.bid"; auctionId: string; data: Record<string, unknown> }
  | { type: "auction.extended"; auctionId: string; data: Record<string, unknown> }
  | { type: "auction.closed"; auctionId: string; data: Record<string, unknown> }
  | { type: "user.notification"; userId: string; data: Record<string, unknown> };

export async function publish(event: RealtimeEvent, db: Db = prisma) {
  const payload = JSON.stringify(event);
  if (payload.length > 7900) throw new Error("Realtime payload too large");
  await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;
}

type State = { emitter: EventEmitter; client: Client | null; connecting: Promise<void> | null };
const g = globalThis as unknown as { __abxBus?: State };
const state: State = (g.__abxBus ??= { emitter: new EventEmitter().setMaxListeners(0), client: null, connecting: null });

function connectionString() {
  const url = new URL(process.env.DATABASE_URL!);
  url.search = "";
  return url.toString();
}

async function ensureListener() {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const client = new Client({ connectionString: connectionString() });
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        state.emitter.emit("event", JSON.parse(msg.payload) as RealtimeEvent);
      } catch {
        /* ignore malformed */
      }
    });
    const reset = () => {
      state.client = null;
      state.connecting = null;
      // Reconnect lazily on next subscription; existing subscribers retry in 2s.
      setTimeout(() => {
        if (state.emitter.listenerCount("event") > 0) ensureListener().catch(() => {});
      }, 2000);
    };
    client.on("error", reset);
    client.on("end", reset);
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    state.client = client;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

export async function subscribe(fn: (e: RealtimeEvent) => void): Promise<() => void> {
  await ensureListener();
  state.emitter.on("event", fn);
  return () => state.emitter.off("event", fn);
}
