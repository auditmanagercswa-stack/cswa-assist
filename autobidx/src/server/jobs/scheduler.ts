import { runDueJobs } from "./queue";
import { closeDueAuctions, sendEndingSoonAlerts, startDueAuctions } from "../services/auctions";
import { expireUnpaidOrders } from "../services/orders";
import { expireOffers } from "../services/sales";
import { expireFeatured } from "../services/vehicles";
import "../notifications/notify"; // registers notification.deliver

/**
 * Periodic work. Safe to run in several processes at once: auction closing locks each auction row,
 * and queue jobs are claimed with SKIP LOCKED.
 */
type Task = { name: string; everyMs: number; run: () => Promise<unknown>; last: number; running: boolean };

const tasks: Task[] = [
  { name: "auctions", everyMs: 2_000, run: async () => { await startDueAuctions(); await closeDueAuctions(); }, last: 0, running: false },
  { name: "jobs", everyMs: 2_000, run: () => runDueJobs(25), last: 0, running: false },
  { name: "ending-alerts", everyMs: 60_000, run: sendEndingSoonAlerts, last: 0, running: false },
  { name: "expiry", everyMs: 5 * 60_000, run: async () => { await expireUnpaidOrders(); await expireOffers(); await expireFeatured(); }, last: 0, running: false },
];

const g = globalThis as unknown as { __abxScheduler?: NodeJS.Timeout };

export function startScheduler(label = "web") {
  if (g.__abxScheduler) return;
  console.info(`[scheduler] started in ${label} process`);
  g.__abxScheduler = setInterval(() => {
    const now = Date.now();
    for (const t of tasks) {
      if (t.running || now - t.last < t.everyMs) continue;
      t.running = true;
      t.last = now;
      t.run()
        .catch((e) => console.error(`[scheduler] ${t.name} failed`, e))
        .finally(() => {
          t.running = false;
        });
    }
  }, 1000);
}

export function stopScheduler() {
  if (g.__abxScheduler) clearInterval(g.__abxScheduler);
  g.__abxScheduler = undefined;
}
