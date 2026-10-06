export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.JOBS_IN_PROCESS !== "false" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./server/jobs/scheduler");
    startScheduler("web");
  }
}
