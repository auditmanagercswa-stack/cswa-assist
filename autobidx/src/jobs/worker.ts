// Dedicated background worker: `npm run worker`.
// Runs auction start/close, notification delivery, expiry jobs. Scale horizontally as needed.
import { startScheduler, stopScheduler } from "../server/jobs/scheduler";

startScheduler("worker");
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopScheduler();
    process.exit(0);
  });
}
