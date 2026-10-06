import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { SiteHeader } from "@/components/layout/site-header";
import { SideNav, type NavGroup } from "@/components/dashboard/sidebar";

export const metadata = { title: { default: "Dashboard", template: "%s · Dashboard · AutoBidX" }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=/dashboard");
  if (!actor.dealer && actor.permissions.has("admin.access")) redirect("/admin");
  const dealerId = actor.dealer?.id;
  const [pendingOffers, actionOrders] = await Promise.all([
    dealerId ? prisma.offer.count({ where: { OR: [{ sellerDealerId: dealerId, awaiting: "SELLER" }, { buyerId: actor.userId, awaiting: "BUYER" }], status: { in: ["PENDING", "COUNTERED"] } } }) : 0,
    prisma.order.count({ where: { OR: [{ buyerId: actor.userId, status: { in: ["PAYMENT_PENDING", "IN_DELIVERY"] } }, ...(dealerId ? [{ sellerDealerId: dealerId, status: { in: ["PAYMENT_RECEIVED" as const, "SELLER_CONFIRMED" as const, "DOCUMENTS_PENDING" as const, "VEHICLE_READY" as const] } }] : [])] } }),
  ]);
  const groups: NavGroup[] = [
    { items: [{ href: "/dashboard", label: "Overview", icon: "LayoutDashboard", exact: true }] },
    {
      title: "Selling",
      items: [
        { href: "/dashboard/vehicles", label: "My Vehicles", icon: "Car" },
        { href: "/dashboard/vehicles/new", label: "List a Vehicle", icon: "PlusCircle", exact: true },
        { href: "/dashboard/auctions", label: "Active Auctions", icon: "Gavel" },
      ],
    },
    {
      title: "Buying",
      items: [
        { href: "/dashboard/bids", label: "My Bids & Wins", icon: "ShoppingBag" },
        { href: "/dashboard/watchlist", label: "Watchlist", icon: "Heart" },
      ],
    },
    {
      title: "Deals",
      items: [
        { href: "/dashboard/offers", label: "Offers", icon: "Handshake", badge: pendingOffers },
        { href: "/dashboard/orders", label: "Orders & Transactions", icon: "Receipt", badge: actionOrders },
        { href: "/dashboard/payments", label: "Payments & Fees", icon: "Wallet" },
        { href: "/dashboard/documents", label: "Documents", icon: "FileText" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/dashboard/analytics", label: "Analytics", icon: "BarChart3" },
        { href: "/dashboard/notifications", label: "Notifications", icon: "Bell" },
        { href: "/dashboard/kyc", label: "KYC & Verification", icon: "ShieldCheck" },
        { href: "/dashboard/settings", label: "Profile & Settings", icon: "Settings" },
      ],
    },
  ];
  const status = actor.dealer?.status;
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {status && status !== "VERIFIED" && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[14px] text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><b>Your account is not verified.</b> {status === "UNDER_REVIEW" ? "KYC is under review — you'll be notified once approved. Bidding and publishing unlock after verification." : status === "REJECTED" ? "KYC needs changes before you can trade." : status === "SUSPENDED" || status === "BLOCKED" ? "Your dealership is suspended. Contact support." : "Complete KYC to bid, buy and publish listings."}</div></div>
            {(status === "PENDING" || status === "REJECTED") && <Link href="/dashboard/kyc" className="inline-flex h-9 shrink-0 items-center rounded-lg bg-ink-900 px-4 text-[13px] font-bold text-white">Complete KYC</Link>}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <SideNav groups={groups} title="Dashboard" />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </>
  );
}
