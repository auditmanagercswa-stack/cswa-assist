import { prisma, type Db } from "@/lib/db";
import type { Prisma, Job } from "@prisma/client";

/**
 * Postgres-backed job queue (FOR UPDATE SKIP LOCKED) — safe with many workers.
 * The interface (enqueue / handler registry) is deliberately small so it can be
 * swapped for BullMQ/SQS when volumes grow.
 */
export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
  db: Db = prisma,
) {
  if (opts.dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return db.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: opts.runAt ?? new Date(),
      dedupeKey: opts.dedupeKey,
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
}

/** Claims and runs up to `limit` due jobs. Returns number processed. */
export async function runDueJobs(limit = 20): Promise<number> {
  const claimed = await prisma.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE (status = 'QUEUED' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
  for (const job of claimed) {
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload as Record<string, unknown>, job);
      await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", lockedAt: null } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failed = job.attempts >= job.maxAttempts;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: failed ? "FAILED" : "QUEUED",
          lastError: msg.slice(0, 2000),
          lockedAt: null,
          // exponential backoff
          runAt: new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 5) * 1000),
        },
      });
    }
  }
  return claimed.length;
}
