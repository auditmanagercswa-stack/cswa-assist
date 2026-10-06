import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseQuery } from "@/server/http";
import { cardSelect } from "@/server/services/vehicles";

export const GET = route(async ({ req }) => {
  const { status, page, perPage } = parseQuery(
    req,
    z.object({
      status: z.enum(["live", "upcoming", "ended"]).optional().default("live"),
      page: z.coerce.number().int().min(1).max(200).optional().default(1),
      perPage: z.coerce.number().int().min(6).max(48).optional().default(24),
    }),
  );
  const now = new Date();
  const where =
    status === "live"
      ? { status: "LIVE" as const, endAt: { gt: now } }
      : status === "upcoming"
        ? { status: "SCHEDULED" as const }
        : { status: "ENDED" as const };
  const [items, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      orderBy: status === "ended" ? { closedAt: "desc" } : status === "upcoming" ? { startAt: "asc" } : { endAt: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, status: true, result: true, startAt: true, endAt: true, currentBid: true, bidCount: true, startingBid: true, vehicle: { select: cardSelect } },
    }),
    prisma.auction.count({ where }),
  ]);
  return { items, total, page, perPage };
});
