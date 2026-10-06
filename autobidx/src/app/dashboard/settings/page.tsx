import Link from "next/link";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { getCurrentActor } from "@/server/auth/session";
import { activePlanId } from "@/server/services/fees";
import { getSetting } from "@/server/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ChangePassword, PlanPicker, ProfileForm, TeamManager } from "./forms";

export const metadata = { title: "Profile & Settings" };

const TABS = [["profile", "Dealership profile"], ["team", "Team"], ["plan", "Subscription"], ["security", "Security"]] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "profile" } = await searchParams;
  const actor = (await getCurrentActor())!;
  const dealer = actor.dealer ? await prisma.dealer.findUnique({ where: { id: actor.dealer.id }, include: { state: true, district: true, city: true } }) : null;
  const manager = actor.dealer?.role === "OWNER" || actor.dealer?.role === "MANAGER";
  return (
    <div>
      <PageHeader title="Profile & Settings" />
      <div className="scroll-rail mb-5 flex gap-1.5 overflow-x-auto">
        {TABS.map(([k, l]) => <Link key={k} href={`/dashboard/settings?tab=${k}`} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>)}
      </div>
      {tab === "profile" && dealer && (
        <Card>
          <CardHeader title={dealer.name} subtitle={`${dealer.district.name}, ${dealer.state.name} · public page /dealer/${dealer.slug}`} />
          <ProfileForm canEdit={manager} initial={{ description: dealer.description ?? "", addressLine: dealer.addressLine, pincode: dealer.pincode }} />
          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 text-[13.5px] sm:grid-cols-2">
            <div><span className="text-slate-500">Account holder:</span> <b>{actor.name}</b></div>
            <div><span className="text-slate-500">Email:</span> <b>{actor.email}</b> {actor.emailVerified ? "✓" : <Link href="/verify" className="text-ignite-600 underline">verify</Link>}</div>
            <div><span className="text-slate-500">Mobile:</span> <b>+91 {actor.phone}</b> {actor.phoneVerified ? "✓" : <Link href="/verify" className="text-ignite-600 underline">verify</Link>}</div>
            <div><span className="text-slate-500">Role:</span> <b>{actor.dealer?.role.toLowerCase()}</b></div>
          </div>
        </Card>
      )}
      {tab === "team" && <TeamSection canManage={manager} />}
      {tab === "plan" && <PlanSection dealerId={actor.dealer?.id ?? null} canManage={manager} />}
      {tab === "security" && <Card><CardHeader title="Change password" subtitle="You'll stay signed in on this device; other sessions are signed out." /><ChangePassword /></Card>}
    </div>
  );
}

async function TeamSection({ canManage }: { canManage: boolean }) {
  const actor = (await getCurrentActor())!;
  const members = await prisma.dealerUser.findMany({ where: { dealerId: actor.dealer!.id }, include: { user: { select: { name: true, email: true, phone: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <Card>
      <CardHeader title="Team members" subtitle="Add employees and control who can bid and list" />
      <TeamManager canManage={canManage} selfUserId={actor.userId} members={members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, canBid: m.canBid, canList: m.canList, active: m.active, lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null }))} />
    </Card>
  );
}

async function PlanSection({ dealerId, canManage }: { dealerId: string | null; canManage: boolean }) {
  const [plans, current, methods, gst, enabled] = await Promise.all([prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }), activePlanId(dealerId), getSetting("payments.enabledMethods"), getSetting("gst.rateBps"), getSetting("features.subscriptions")]);
  const sub = dealerId ? await prisma.subscription.findFirst({ where: { dealerId, status: "ACTIVE" }, orderBy: { startAt: "desc" } }) : null;
  return (
    <PlanPicker
      enabled={enabled}
      canManage={canManage}
      currentId={current}
      renewsAt={sub?.endAt?.toISOString() ?? null}
      methods={methods.filter((m) => m !== "BANK_TRANSFER")}
      plans={plans.map((p) => ({ id: p.id, code: p.code, name: p.name, price: p.priceMonthly, priceWithGst: p.priceMonthly + Math.round((p.priceMonthly * gst) / 10000), features: (p.features as string[]) ?? [], listingLimit: p.listingLimit }))}
    />
  );
}
