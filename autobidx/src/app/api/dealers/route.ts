import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseQuery } from "@/server/http";

export const GET = route(async ({ req }) => {
  const { q, state, page } = parseQuery(req, z.object({ q: z.string().max(60).optional(), state: z.string().max(60).optional(), page: z.coerce.number().int().min(1).max(500).default(1) }));
  const where = { status: "VERIFIED" as const, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(state ? { state: { slug: state } } : {}) };
  const [items, total] = await Promise.all([
    prisma.dealer.findMany({
      where,
      orderBy: [{ soldCount: "desc" }, { name: "asc" }],
      skip: (page - 1) * 24,
      take: 24,
      select: { id: true, slug: true, name: true, ratingAvg: true, ratingCount: true, soldCount: true, createdAt: true, district: { select: { name: true } }, state: { select: { name: true } }, _count: { select: { vehicles: { where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] } } } } } },
    }),
    prisma.dealer.count({ where }),
  ]);
  return { items, total, page };
});
