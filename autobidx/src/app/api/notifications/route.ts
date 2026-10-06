import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson, parseQuery } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";

export const GET = route(async ({ req, actor }) => {
  const a = requireActor(actor);
  const { cursor, unread } = parseQuery(req, z.object({ cursor: z.string().optional(), unread: z.enum(["1"]).optional() }));
  const items = await prisma.notification.findMany({
    where: { userId: a.userId, ...(unread ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
  const unreadCount = await prisma.notification.count({ where: { userId: a.userId, readAt: null } });
  return { items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19].id : null, unreadCount };
});

export const POST = route(async ({ req, actor }) => {
  const a = requireActor(actor);
  const { ids, all } = await parseJson(req, z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }));
  await prisma.notification.updateMany({ where: { userId: a.userId, readAt: null, ...(all ? {} : { id: { in: ids ?? [] } }) }, data: { readAt: new Date() } });
  return { ok: true };
});
