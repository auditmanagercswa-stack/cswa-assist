import Link from "next/link";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { listSettings } from "@/server/settings";
import { listFeesAdmin } from "@/server/services/fee-admin";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/card";
import { SettingsEditor, FeeEditor, PlanEditor, CmsEditor } from "./editors";

export const metadata = { title: "Settings & Content" };

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "admin.access");
  const { tab: t } = await searchParams;
  const tabs: [string, string, string][] = [["platform", "Platform rules", "settings.manage"], ["fees", "Fees & commission", "fees.manage"], ["plans", "Subscription plans", "fees.manage"], ["content", "CMS content", "content.manage"], ["roles", "Roles & permissions", "admin.access"]];
  const allowed = tabs.filter(([, , p]) => can(actor, p as never));
  const tab = allowed.find(([k]) => k === t)?.[0] ?? allowed[0]?.[0];
  return (
    <div>
      <PageHeader title="Settings & Content" subtitle="Every business rule is configurable here — no code changes needed" />
      <div className="scroll-rail mb-5 flex gap-1.5 overflow-x-auto">
        {allowed.map(([k, l]) => <Link key={k} href={`/admin/settings?tab=${k}`} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>)}
      </div>
      {tab === "platform" && <SettingsEditor items={JSON.parse(JSON.stringify(await listSettings()))} />}
      {tab === "fees" && <FeesTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "content" && <ContentTab />}
      {tab === "roles" && <RolesTab />}
    </div>
  );
}

async function FeesTab() {
  const [fees, plans] = await Promise.all([listFeesAdmin(), prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } })]);
  return <FeeEditor fees={JSON.parse(JSON.stringify(fees))} plans={plans} />;
}

async function PlansTab() {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } } } });
  return <PlanEditor plans={plans.map((p) => ({ id: p.id, code: p.code, name: p.name, priceMonthly: p.priceMonthly, listingLimit: p.listingLimit, featuredCredits: p.featuredCredits, analytics: p.analytics, advancedAnalytics: p.advancedAnalytics, prioritySupport: p.prioritySupport, features: (p.features as string[]) ?? [], active: p.active, subscribers: p._count.subscriptions }))} />;
}

async function ContentTab() {
  const [pages, faqs, banners] = await Promise.all([
    prisma.cmsPage.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] }),
    prisma.faq.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return <CmsEditor pages={JSON.parse(JSON.stringify(pages))} faqs={JSON.parse(JSON.stringify(faqs))} banners={JSON.parse(JSON.stringify(banners))} />;
}

async function RolesTab() {
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } });
  const keys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Permission</th>
            {roles.map((r) => <th key={r.id} className="px-3 py-2.5 text-center font-semibold text-slate-600">{r.name}<div className="text-[11px] font-normal text-slate-400">{r._count.users} users{r.enabled ? "" : " · disabled"}</div></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {keys.map((k) => (
            <tr key={k}>
              <td className="px-3 py-2"><div className="font-mono text-[12px] text-ink-900">{k}</div><div className="text-[11.5px] text-slate-500">{PERMISSIONS[k]}</div></td>
              {roles.map((r) => <td key={r.id} className="text-center">{r.permissions.some((p) => p.permission.key === k) ? <span className="font-bold text-verified-600">✓</span> : <span className="text-slate-300">—</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-[12px] text-slate-500">Role–permission mappings are stored in the database (RolePermission). The Individual Buyer role exists and is gated by the “Allow individual buyers” setting.</p>
    </div>
  );
}
