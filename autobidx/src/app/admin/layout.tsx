import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { SiteHeader } from "@/components/layout/site-header";
import { SideNav, type NavGroup, type NavItem } from "@/components/dashboard/sidebar";

export const metadata = { title: { default: "Admin", template: "%s · Admin · Alpha Cars" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=/admin");
  if (!actor.permissions.has("admin.access")) redirect("/dashboard");
  const [kyc, pendingVehicles, disputes, transfers, flags] = await Promise.all([
    prisma.dealer.count({ where: { status: "UNDER_REVIEW" } }),
    prisma.vehicle.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS"] } } }),
    prisma.payment.count({ where: { status: "PROCESSING" } }),
    prisma.fraudFlag.count({ where: { status: "OPEN" } }),
  ]);
  const p = actor.permissions;
  const items: (NavItem & { perm: string })[] = [
    { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", exact: true, perm: "admin.access" },
    { href: "/admin/dealers", label: "Dealers & KYC", icon: "Users", badge: kyc, perm: "dealers.view" },
    { href: "/admin/vehicles", label: "Vehicles", icon: "Car", badge: pendingVehicles, perm: "vehicles.manage" },
    { href: "/admin/auctions", label: "Auctions", icon: "Gavel", perm: "auctions.manage" },
    { href: "/admin/bids", label: "Bids", icon: "Hammer", perm: "bids.view" },
    { href: "/admin/orders", label: "Orders", icon: "Receipt", perm: "orders.manage" },
    { href: "/admin/payments", label: "Payments & Refunds", icon: "CreditCard", badge: transfers, perm: "payments.manage" },
    { href: "/admin/disputes", label: "Disputes", icon: "Scale", badge: disputes, perm: "disputes.manage" },
    { href: "/admin/reports", label: "Reports & Analytics", icon: "BarChart3", perm: "reports.view" },
    { href: "/admin/reports?tab=fraud", label: "Fraud & Audit", icon: "ShieldAlert", badge: flags, perm: "fraud.manage" },
    { href: "/admin/settings", label: "Settings & Content", icon: "Settings", perm: "admin.access" },
  ];
  const visible = items.filter((i) => p.has(i.perm));
  const groups: NavGroup[] = [
    { items: visible.slice(0, 1) },
    { title: "Marketplace", items: visible.filter((i) => ["/admin/dealers", "/admin/vehicles", "/admin/auctions", "/admin/bids"].includes(i.href)) },
    { title: "Money", items: visible.filter((i) => ["/admin/orders", "/admin/payments", "/admin/disputes"].includes(i.href)) },
    { title: "Platform", items: visible.filter((i) => i.href.startsWith("/admin/reports") || i.href === "/admin/settings") },
  ];
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <SideNav groups={groups} title="Admin" />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </>
  );
}
