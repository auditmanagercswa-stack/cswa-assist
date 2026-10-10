import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;

/** BigInt paise from the DB → JS number paise (safe up to ₹90 trillion). */
export const n = (v: bigint | number | null | undefined): number => (v == null ? 0 : typeof v === "bigint" ? Number(v) : v);
export const big = (v: number): bigint => BigInt(Math.round(v));
