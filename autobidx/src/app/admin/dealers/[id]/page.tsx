import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { activePlanId } from "@/server/services/fees";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { DashboardCard } from "@/components/ui/stat";

export const metadata = { title: "Dealer" };

export default async function AdminDealer({ params }: { params: Promise<{ id: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "dealers.view");
  const { id } = await params;
  const d = await prisma.dealer.findUnique({
    where: { id },
    include: {
      state: true,
      district: true,
      city: true,
      members: { include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, lastLoginAt: true, lastLoginIp: true, signupIp: true, emailVerifiedAt: true, phoneVerifiedAt: true } } } },
      kyc: { orderBy: { createdAt: "desc" }, take: 1, include: { documents: { include: { file: { select: { id: true, originalName: true, mime: true } } } } } },
      fraudFlags: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!d) notFound();
  const [vehicles, sales, purchases, bids, fees, planId, audit] = await Promise.all([
    prisma.vehicle.findMany({ where: { dealerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, status: true, expectedPrice: true } }),
    prisma.order.aggregate({ where: { sellerDealerId: id, paymentStatus: "PAID" }, _sum: { vehiclePrice: true, sellerFee: true }, _count: true }),
    prisma.order.aggregate({ where: { buyerDealerId: id, paymentStatus: "PAID" }, _sum: { vehiclePrice: true, buyerFee: true }, _count: true }),
    prisma.bid.count({ where: { dealerId: id } }),
    prisma.payment.aggregate({ where: { dealerId: id, purpose: { not: "ORDER" }, status: "PAID" }, _sum: { amount: true } }),
    activePlanId(id),
    prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } }),
  ]);
  const plan = planId ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
  const orders = await prisma.order.findMany({ where: { OR: [{ sellerDealerId: id }, { buyerDealerId: id }] }, orderBy: { createdAt: "desc" }, take: 10, include: { vehicle: { select: { title: true } } } });
  const k = d.kyc[0];
  const manage = can(actor, "dealers.manage");
  return (
    <div>
      <Link href="/admin/dealers" className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Dealers</Link>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Dealer <StatusBadge status={d.status} /></span>}
        title={d.name}
        subtitle={`${humanize(d.businessType)} · ${[d.city?.name, d.district.name, d.state.name].filter(Boolean).join(", ")} · joined ${formatDate(d.createdAt)}${plan ? ` · ${plan.name} plan` : ""}`}
        actions={
          manage && (
            <>
              {d.status === "UNDER_REVIEW" || d.status === "PENDING" || d.status === "REJECTED" ? (
                <>
                  <ActionButton url={`/api/admin/dealers/${id}/kyc`} body={{ decision: "APPROVE", notes: "" }} label="Approve KYC" variant="success" size="md" confirm={{ title: "Approve and verify this dealer?", body: "They'll be able to list, bid and buy immediately." }} success="Dealer verified" />
                  <ActionButton url={`/api/admin/dealers/${id}/kyc`} body={{ decision: "REJECT" }} label="Reject" size="md" danger reason={{ label: "What needs to be fixed? (sent to the dealer)", required: true, field: "notes" }} success="KYC rejected" />
                </>
              ) : null}
              {d.status === "VERIFIED" && <ActionButton url={`/api/admin/dealers/${id}/status`} body={{ status: "SUSPENDED" }} label="Suspend" size="md" danger reason={{ label: "Reason (sent to the dealer)", required: true }} success="Dealer suspended" />}
              {(d.status === "VERIFIED" || d.status === "SUSPENDED") && <ActionButton url={`/api/admin/dealers/${id}/status`} body={{ status: "BLOCKED" }} label="Block" size="md" danger reason={{ label: "Reason", required: true }} confirm={{ title: "Block this dealership?", body: "All members are signed out and can't trade. This is reversible." }} success="Dealer blocked" />}
              {(d.status === "SUSPENDED" || d.status === "BLOCKED") && <ActionButton url={`/api/admin/dealers/${id}/status`} body={{ status: "VERIFIED" }} label="Reinstate" size="md" variant="success" reason={{ label: "Reinstatement note", required: true }} success="Dealer reinstated" />}
            </>
          )
        }
      />
      {d.statusReason && <div className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Status note: {d.statusReason}</div>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Sales" value={`${sales._count} · ${formatINR(sales._sum.vehiclePrice ?? 0)}`} />
        <DashboardCard label="Purchases" value={`${purchases._count} · ${formatINR(purchases._sum.vehiclePrice ?? 0)}`} />
        <DashboardCard label="Bids placed" value={bids} />
        <DashboardCard label="Fees generated" value={formatINR((sales._sum.sellerFee ?? 0) + (purchases._sum.buyerFee ?? 0) + (fees._sum.amount ?? 0))} tone="green" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="KYC" subtitle={k ? `Status ${humanize(k.status)}${k.submittedAt ? ` · submitted ${formatDateTime(k.submittedAt)}` : ""}` : "Not submitted"} />
          {k ? (
            <>
              <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
                <div><dt className="text-slate-500">PAN</dt><dd className="font-mono font-semibold">{d.pan}</dd></div>
                <div><dt className="text-slate-500">GSTIN</dt><dd className="font-mono font-semibold">{d.gstin ?? "—"}</dd></div>
                <div><dt className="text-slate-500">Bank</dt><dd className="font-semibold">{k.bankName ?? "—"} · ••••{k.bankAccountLast4 ?? "----"}</dd></div>
                <div><dt className="text-slate-500">IFSC</dt><dd className="font-mono font-semibold">{k.bankIfsc ?? "—"}</dd></div>
                <div><dt className="text-slate-500">Account name</dt><dd className="font-semibold">{k.bankAccountName ?? "—"}</dd></div>
                <div><dt className="text-slate-500">Authorised person</dt><dd className="font-semibold">{k.authorizedName ?? "—"} ({k.authorizedDesignation ?? "—"})</dd></div>
              </dl>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {k.documents.map((doc) => (
                  <a key={doc.id} href={`/api/files/${doc.file.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[13px] hover:border-ink-900">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" />{humanize(doc.type)}</span>
                    <span className={doc.verified ? "text-[11.5px] font-semibold text-verified-600" : "text-[11.5px] text-slate-400"}>{doc.verified ? "verified" : "open"}</span>
                  </a>
                ))}
                {k.documents.length === 0 && <p className="text-sm text-slate-500">No documents uploaded.</p>}
              </div>
              {k.reviewNotes && <p className="mt-3 text-[13px] text-slate-600">Review notes: {k.reviewNotes}</p>}
            </>
          ) : <p className="text-sm text-slate-500">The dealer hasn&apos;t started KYC yet.</p>}
        </Card>
        <Card>
          <CardHeader title="Team members" />
          <ul className="divide-y divide-slate-100 text-[13.5px]">
            {d.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-semibold text-ink-900">{m.user.name} <span className="text-[12px] font-normal text-slate-400">· {m.role.toLowerCase()}</span></div>
                  <div className="text-[12px] text-slate-500">{m.user.email} · +91 {m.user.phone} · {m.user.emailVerifiedAt ? "email ✓" : "email ✗"} · signup IP {m.user.signupIp ?? "—"} · last login {m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : "never"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.user.status} />
                  {can(actor, "users.manage") && (m.user.status === "ACTIVE" ? <ActionButton url={`/api/admin/users/${m.user.id}`} body={{ status: "SUSPENDED" }} label="Suspend user" danger reason={{ label: "Reason", required: true }} success="User suspended" /> : <ActionButton url={`/api/admin/users/${m.user.id}`} body={{ status: "ACTIVE" }} label="Reactivate" reason={{ label: "Note", required: true }} success="User reactivated" />)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent vehicles" action={<Link href={`/admin/vehicles?dealer=${d.id}`} className="text-[13px] font-semibold text-ignite-600">All</Link>} />
          <ul className="divide-y divide-slate-100 text-[13.5px]">
            {vehicles.map((v) => <li key={v.id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/vehicles/${v.id}`} className="truncate font-semibold hover:text-ignite-600">{v.title}</Link><span className="flex shrink-0 items-center gap-2"><span className="num">{formatINR(v.expectedPrice)}</span><StatusBadge status={v.status} /></span></li>)}
            {vehicles.length === 0 && <li className="py-2 text-slate-500">No vehicles.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Transaction history" />
          <ul className="divide-y divide-slate-100 text-[13.5px]">
            {orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/orders/${o.id}`} className="min-w-0 truncate hover:text-ignite-600"><span className="font-mono text-[12px]">{o.orderNumber}</span> · {o.vehicle.title} · {o.sellerDealerId === id ? "sold" : "bought"}</Link><StatusBadge status={o.status} /></li>)}
            {orders.length === 0 && <li className="py-2 text-slate-500">No transactions.</li>}
          </ul>
        </Card>
        {d.fraudFlags.length > 0 && (
          <Card>
            <CardHeader title="Fraud signals" subtitle="Heuristics only — review before acting" />
            <ul className="space-y-2 text-[13px]">{d.fraudFlags.map((f) => <li key={f.id} className="flex items-center justify-between gap-2"><span>{humanize(f.type)} · severity {f.severity} · {formatDate(f.createdAt)}</span><StatusBadge status={f.status} /></li>)}</ul>
          </Card>
        )}
        <Card>
          <CardHeader title="Audit trail" />
          <ul className="space-y-1.5 text-[13px]">{audit.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="font-mono text-[12px]">{a.action}</span><span className="text-slate-500">{a.user?.name ?? "system"} · {formatDateTime(a.createdAt)}</span></li>)}{audit.length === 0 && <li className="text-slate-500">No entries.</li>}</ul>
        </Card>
      </div>
    </div>
  );
}
