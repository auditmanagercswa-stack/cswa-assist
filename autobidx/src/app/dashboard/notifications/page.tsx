import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { ActionButton } from "@/components/ui/action-button";
import { Pagination } from "@/components/ui/pagination";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const actor = (await getCurrentActor())!;
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { deliveries: { select: { channel: true, status: true } } } }),
    prisma.notification.count({ where: { userId: actor.userId } }),
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
  ]);
  return (
    <div>
      <PageHeader title="Notifications" subtitle={`${unread} unread`} actions={unread ? <ActionButton url="/api/notifications" body={{ all: true }} label="Mark all as read" success="All caught up" /> : null} />
      {items.length === 0 ? <EmptyState icon={<Bell className="h-7 w-7" />} title="No notifications yet" description="Bids, offers, payments and order updates will show up here." /> : (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-white">
          {items.map((n) => (
            <li key={n.id} className={cn("border-b border-slate-100 last:border-0", !n.readAt && "bg-ignite-50/40")}>
              <Link href={n.link ?? "#"} className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-ignite-500")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink-900">{n.title}</span><span className="text-[12px] text-slate-400">{formatDateTime(n.createdAt)}</span></div>
                  <div className="text-[13.5px] text-slate-600">{n.body}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{humanize(n.type)}{n.deliveries.length ? ` · also via ${n.deliveries.map((d) => `${humanize(d.channel)} (${d.status.toLowerCase()})`).join(", ")}` : ""}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={Math.ceil(total / 30)} basePath="/dashboard/notifications" params={sp} />
    </div>
  );
}
