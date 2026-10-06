import Link from "next/link";
import type { FraudFlagStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINRCompact, humanize } from "@/lib/format";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { adminCharts, adminReportMetrics } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DashboardCard } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/charts";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { Pills, SearchBox } from "../_filters";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; q?: string; page?: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "admin.access");
  const sp = await searchParams;
  const tab = sp.tab === "fraud" || sp.tab === "audit" ? sp.tab : "overview";
  const tabs: [string, string, string][] = [["overview", "Analytics", "reports.view"], ["fraud", "Fraud signals", "fraud.manage"], ["audit", "Audit log", "audit.view"]];
  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Marketplace health, fraud review and the immutable audit trail" />
      <div className="mb-5 flex gap-1.5">
        {tabs.filter(([, , p]) => can(actor, p as never)).map(([k, l]) => <Link key={k} href={`/admin/reports?tab=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>)}
      </div>
      {tab === "overview" && can(actor, "reports.view") && <Overview />}
      {tab === "fraud" && can(actor, "fraud.manage") && <Fraud status={sp.status} page={Number(sp.page) || 1} sp={sp} />}
      {tab === "audit" && can(actor, "audit.view") && <Audit q={sp.q} page={Number(sp.page) || 1} sp={sp} />}
    </div>
  );
}

async function Overview() {
  const [m, c] = await Promise.all([adminReportMetrics(), adminCharts()]);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Auction success rate" value={`${m.auctionSuccessRate}%`} sub={`${m.endedAuctions} ended auctions`} tone="green" />
        <DashboardCard label="Bid-to-sale conversion" value={`${m.bidToSaleConversion}%`} sub="auctions with bids → paid orders" />
        <DashboardCard label="Average selling price" value={formatINRCompact(m.averageSellingPrice)} />
        <DashboardCard label="Vehicle turnover" value={`${m.vehicleTurnoverDays} days`} sub="published → sold" tone="dark" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="GMV trend" /><LineChart data={c.gmvByMonth} format="inr" label="GMV per month" /></Card>
        <Card><CardHeader title="Revenue trend" /><LineChart data={c.revenueByMonth} format="inr" label="Revenue per month" /></Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Geographic trends" subtitle="Top districts by listings" action={<span className="flex gap-3 text-[13px] font-semibold"><a href="/api/admin/reports/export?type=orders" className="text-ignite-600">Orders CSV</a><a href="/api/admin/reports/export?type=payments" className="text-ignite-600">Payments CSV</a><a href="/api/admin/reports/export?type=dealers" className="text-ignite-600">Dealers CSV</a></span>} />
        <table className="w-full text-left text-[13.5px]">
          <thead><tr className="text-[11.5px] uppercase tracking-wide text-slate-400"><th className="py-2">District</th><th>State</th><th className="text-right">Listings</th><th className="text-right">Sold</th><th className="text-right">Sell-through</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{c.geo.map((g) => <tr key={g.district + g.state}><td className="py-2 font-semibold">{g.district}</td><td>{g.state}</td><td className="num text-right">{g.vehicles}</td><td className="num text-right">{g.sold}</td><td className="num text-right">{g.vehicles ? Math.round((g.sold / g.vehicles) * 100) : 0}%</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}

async function Fraud({ status, page, sp }: { status?: string; page: number; sp: Record<string, string | undefined> }) {
  const where: Prisma.FraudFlagWhereInput = { status: (status as FraudFlagStatus) ?? "OPEN" };
  const [rows, total] = await Promise.all([
    prisma.fraudFlag.findMany({ where, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25, include: { user: { select: { name: true, email: true } }, dealer: { select: { id: true, name: true } } } }),
    prisma.fraudFlag.count({ where }),
  ]);
  return (
    <>
      <p className="mb-3 text-[13px] text-slate-500">Signals are heuristics for human review. Nothing is banned automatically — suspend accounts from the dealer page if warranted.</p>
      <Pills base="/admin/reports" current={status ?? "OPEN"} extra={{ tab: "fraud" }} options={[["OPEN", "Open"], ["REVIEWED", "Reviewed"], ["ACTIONED", "Actioned"], ["DISMISSED", "Dismissed"]]} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => humanize(r.type)}
        empty={<EmptyState title="No flags" description="No suspicious activity in this view." />}
        columns={[
          { key: "t", header: "Signal", hideOnMobile: true, cell: (r) => <div><div className="font-semibold text-ink-900">{humanize(r.type)}</div><div className="text-[11.5px] text-slate-400">{formatDateTime(r.createdAt)}</div></div> },
          { key: "s", header: "Severity", cell: (r) => <span className={cn("font-bold", r.severity >= 3 ? "text-red-600" : r.severity === 2 ? "text-amber-600" : "text-slate-500")}>{["", "Low", "Medium", "High"][r.severity]}</span> },
          { key: "w", header: "Account", cell: (r) => <div>{r.dealer ? <Link href={`/admin/dealers/${r.dealer.id}`} className="font-semibold hover:text-ignite-600">{r.dealer.name}</Link> : null}<div className="text-[11.5px] text-slate-400">{r.user?.email}</div></div> },
          { key: "d", header: "Details", cell: (r) => <code className="block max-w-[280px] truncate text-[11.5px] text-slate-500" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</code> },
          { key: "x", header: "", align: "right", cell: (r) => (r.status === "OPEN" ? <div className="flex justify-end gap-1.5"><ActionButton url={`/api/admin/fraud/${r.id}`} body={{ status: "DISMISSED" }} label="Dismiss" reason={{ label: "Review note", required: true, field: "note" }} success="Dismissed" /><ActionButton url={`/api/admin/fraud/${r.id}`} body={{ status: "ACTIONED" }} label="Mark actioned" variant="dark" reason={{ label: "What action was taken?", required: true, field: "note" }} success="Recorded" /></div> : <div className="text-right"><StatusBadge status={r.status} />{r.reviewNote && <div className="max-w-[200px] truncate text-[11px] text-slate-400">{r.reviewNote}</div>}</div>) },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/reports" params={sp} />
    </>
  );
}

async function Audit({ q, page, sp }: { q?: string; page: number; sp: Record<string, string | undefined> }) {
  const where: Prisma.AuditLogWhereInput = q ? { OR: [{ action: { contains: q } }, { entityId: q }, { entityType: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q.toLowerCase() } } }] } : {};
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { user: { select: { name: true, email: true } } } }), prisma.auditLog.count({ where })]);
  return (
    <>
      <SearchBox placeholder="Action (e.g. bid.place, kyc.approve), entity id or user email" q={q} hidden={{ tab: "audit" }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.action}
        empty={<EmptyState title="No audit entries" />}
        columns={[
          { key: "t", header: "Time", cell: (r) => <span className="text-[12.5px]">{formatDateTime(r.createdAt)}</span> },
          { key: "a", header: "Action", hideOnMobile: true, cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-ink-900">{r.action}</span> },
          { key: "u", header: "User", cell: (r) => <span className="text-[12.5px]">{r.user ? `${r.user.name} (${r.user.email})` : "system"}</span> },
          { key: "e", header: "Entity", cell: (r) => <span className="font-mono text-[11.5px] text-slate-500">{r.entityType ?? "—"} {r.entityId ? r.entityId.slice(0, 10) : ""}</span> },
          { key: "c", header: "Change", cell: (r) => <code className="block max-w-[300px] truncate text-[11.5px] text-slate-500" title={JSON.stringify({ before: r.before, after: r.after })}>{r.after ? JSON.stringify(r.after) : ""}</code> },
          { key: "i", header: "IP", cell: (r) => <span className="text-[11.5px] text-slate-400">{r.ip ?? ""}</span> },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 50)} basePath="/admin/reports" params={sp} />
      <p className="mt-3 text-[12px] text-slate-400">Sensitive fields (passwords, tokens, bank numbers) are redacted before logging.</p>
    </>
  );
}
