import { prisma, type Db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

const SENSITIVE = /password|hash|token|secret|bankAccount(?!Last4)|otp/i;

function scrub(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (k && SENSITIVE.test(k) ? "[redacted]" : val)),
  ) as Prisma.InputJsonValue;
}

/** Appends to the immutable audit trail. Pass the transaction client to keep it atomic with the change. */
export async function audit(input: AuditInput, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: scrub(input.before),
      after: scrub(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Returns only the keys that changed between two flat objects (for before/after audit). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const bv = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const av = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}
