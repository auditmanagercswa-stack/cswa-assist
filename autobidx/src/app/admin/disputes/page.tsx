import Link from "next/link";
import type { DisputeStatus, Prisma } from "@prisma/client";
import { Scale } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pills } from "../_filters";

export const metadata = { title: "Disputes" };

export default async function AdminDisputes({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  requirePermission(await getCurrentActor(), "disputes.manage");
  const sp = await searchParams;
  const where: Prisma.DisputeWhereInput = sp.status === "closed" ? { status: { in: ["RESOLVED", "REFUNDED", "CLOSED"] } } : sp.status ? { status: sp.status as DisputeStatus } : { status: { in: ["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS"] } };
  const rows = await prisma.dispute.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { orderNumber: true, vehicle: { select: { title: true } } } }, raisedBy: { select: { name: true } }, assignee: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } });
  return (
    <div>
      <PageHeader title="Disputes" subtitle="Investigate, communicate, refund, penalise and close — with full audit history" />
      <Pills base="/admin/disputes" current={sp.status} options={[["", "Active"], ["OPEN", "Open"], ["INVESTIGATING", "Investigating"], ["AWAITING_DOCUMENTS", "Awaiting docs"], ["closed", "Closed"]]} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => <Link href={`/admin/disputes/${r.id}`}>{r.number}</Link>}
        empty={<EmptyState icon={<Scale className="h-7 w-7" />} title="No disputes here" description="Great — nothing needs attention." />}
        columns={[
          { key: "n", header: "Dispute", hideOnMobile: true, cell: (r) => <div><Link href={`/admin/disputes/${r.id}`} className="font-mono text-[12.5px] font-semibold hover:text-ignite-600">{r.number}</Link><div className="max-w-[260px] truncate text-[13px] font-semibold text-ink-900">{r.subject}</div></div> },
          { key: "o", header: "Order", cell: (r) => <div><div className="font-mono text-[12px]">{r.order.orderNumber}</div><div className="max-w-[200px] truncate text-[12px] text-slate-500">{r.order.vehicle.title}</div></div> },
          { key: "c", header: "Category", cell: (r) => humanize(r.category) },
          { key: "b", header: "Raised by", cell: (r) => `${r.raisedBy.name} (${r.raisedByParty.toLowerCase()})` },
          { key: "t", header: "Opened", cell: (r) => <div className="text-[12.5px]">{formatDateTime(r.createdAt)}<div className="text-slate-400">last activity {timeAgo(r.messages[0]?.createdAt ?? r.updatedAt)}</div></div> },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={r.status} /><span className="text-[11px] text-slate-400">{r.assignee?.name ?? "unassigned"}</span></div> },
        ]}
      />
    </div>
  );
}
