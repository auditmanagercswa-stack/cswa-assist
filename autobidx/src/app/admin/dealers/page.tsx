import Link from "next/link";
import type { DealerStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Pills, SearchBox } from "../_filters";

export const metadata = { title: "Dealers" };

export default async function AdminDealers({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  requirePermission(await getCurrentActor(), "dealers.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.DealerWhereInput = {
    ...(sp.status ? { status: sp.status as DealerStatus } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { gstin: { contains: sp.q.toUpperCase() } }, { pan: { contains: sp.q.toUpperCase() } }, { members: { some: { user: { OR: [{ email: { contains: sp.q.toLowerCase() } }, { phone: { contains: sp.q } }] } } } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.dealer.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { district: true, state: true, _count: { select: { vehicles: true, sales: true } }, members: { where: { role: "OWNER" }, take: 1, include: { user: { select: { email: true, phone: true } } } } } }),
    prisma.dealer.count({ where }),
    prisma.dealer.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <div>
      <PageHeader title="Dealers" subtitle={`${formatNumber(total)} dealerships`} actions={<a href="/api/admin/reports/export?type=dealers" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900">Export CSV</a>} />
      <Pills base="/admin/dealers" current={sp.status} extra={{ q: sp.q }} options={[["", "All"], ["UNDER_REVIEW", `Under review (${c("UNDER_REVIEW")})`], ["PENDING", `Pending (${c("PENDING")})`], ["VERIFIED", `Verified (${c("VERIFIED")})`], ["REJECTED", "Rejected"], ["SUSPENDED", "Suspended"], ["BLOCKED", "Blocked"]]} />
      <SearchBox placeholder="Name, GSTIN, PAN, email or mobile" q={sp.q} hidden={{ status: sp.status }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => <Link href={`/admin/dealers/${r.id}`}>{r.name}</Link>}
        empty={<EmptyState title="No dealers found" />}
        columns={[
          { key: "n", header: "Dealer", hideOnMobile: true, cell: (r) => <div><Link href={`/admin/dealers/${r.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.name}</Link><div className="text-[12px] text-slate-400">{r.members[0]?.user.email}</div></div> },
          { key: "l", header: "Location", cell: (r) => `${r.district.name}, ${r.state.code}` },
          { key: "g", header: "GSTIN", cell: (r) => <span className="font-mono text-[12px]">{r.gstin ?? "—"}</span> },
          { key: "v", header: "Vehicles · Sales", align: "right", cell: (r) => `${r._count.vehicles} · ${r._count.sales}` },
          { key: "j", header: "Joined", cell: (r) => formatDate(r.createdAt) },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/dealers" params={sp} />
    </div>
  );
}
