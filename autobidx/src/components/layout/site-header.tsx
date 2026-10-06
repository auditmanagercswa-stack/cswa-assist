import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { HeaderClient } from "./header-client";

export async function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const actor = await getCurrentActor();
  const unread = actor ? await prisma.notification.count({ where: { userId: actor.userId, readAt: null } }) : 0;
  return <HeaderClient transparent={transparent} user={actor ? { name: actor.name, dealerName: actor.dealer?.name ?? null, isAdmin: actor.permissions.has("admin.access"), unread } : null} />;
}
