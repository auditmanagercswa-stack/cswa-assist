import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
export { Prisma };
