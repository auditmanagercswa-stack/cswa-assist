import type { Role } from "@prisma/client";

export class ForbiddenError extends Error {}

/** Owners and accountants write; auditors are read-only. */
export function assertCanWrite(ctx: { role: Role }) {
  if (ctx.role === "AUDITOR") throw new ForbiddenError("Auditors have read-only access.");
}
export function assertOwner(ctx: { role: Role }) {
  if (ctx.role !== "OWNER") throw new ForbiddenError("Only the owner can change this.");
}
