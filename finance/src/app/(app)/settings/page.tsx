import Link from "next/link";
import { cookies } from "next/headers";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { fyLabel } from "@/lib/fy";
import { aiEnabled, MODEL } from "@/lib/ai/client";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageTitle } from "@/components/ui/misc";
import { ProfileForm } from "@/components/settings/profile-form";
import { AddMember, LockControls, RemoveMember, ThemeToggle } from "@/components/settings/controls";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getCtx();
  const c = ctx.company;
  const [members, audit] = await Promise.all([
    db.membership.findMany({ where: { companyId: c.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { companyId: c.id }, include: { user: true }, orderBy: { at: "desc" }, take: 15 }),
  ]);
  const dark = (await cookies()).get("theme")?.value === "dark";
  const isOwner = ctx.role === "OWNER";
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageTitle pre="Company" em="settings" sub={`You are ${ctx.role.toLowerCase()} of ${c.name}.`} actions={<Link href="/firm" className="text-sm text-gold hover:underline">All companies →</Link>} />
      <Card className="p-5 md:p-6"><h2 className="mb-4 text-xl">Business details</h2><ProfileForm canEdit={isOwner} v={{ name: c.name, address: c.address, email: c.email, phone: c.phone, gstin: c.gstin, pan: c.pan, tan: c.tan, stateCode: c.stateCode, upiId: c.upiId, flags: c.flags, legalType: c.legalType }} /></Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="grid content-start gap-3 p-5 md:p-6">
          <h2 className="text-xl">Year-end lock</h2>
          <p className="text-sm text-ink-2">{c.booksLockedUpto ? <>Books are locked up to <b>{fmtDate(c.booksLockedUpto)}</b>. Nothing on or before that date can be posted or reversed.</> : "Books are open. Lock a year after closing so nobody changes filed numbers."}</p>
          <LockControls fy={ctx.fy} fyLabel={fyLabel(ctx.fy)} lockedUpto={c.booksLockedUpto ? c.booksLockedUpto.toISOString() : null} isOwner={isOwner} />
        </Card>
        <Card className="grid content-start gap-3 p-5 md:p-6">
          <h2 className="text-xl">Appearance &amp; AI</h2>
          <ThemeToggle dark={dark} />
          <p className="text-sm text-ink-2">AI drafting: {aiEnabled() ? <Chip tone="mint">Claude · {MODEL}</Chip> : <Chip tone="warn">Rules only — set ANTHROPIC_API_KEY</Chip>}</p>
          <Link href="/settings/tally" className="text-sm text-gold hover:underline">Tally sync →</Link>
        </Card>
      </div>
      <Card className="grid gap-4 p-5 md:p-6">
        <h2 className="text-xl">People</h2>
        <ul className="divide-y divide-hairline">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.user.name ?? m.user.email}<span className="block text-xs text-ink-3">{m.user.email}</span></span>
              <Chip tone={m.role === "OWNER" ? "gold" : m.role === "AUDITOR" ? "neutral" : "mint"}>{m.role.toLowerCase()}</Chip>
              {isOwner && m.userId !== ctx.user.id && <RemoveMember userId={m.userId} />}
            </li>
          ))}
        </ul>
        {isOwner && <AddMember />}
        <p className="text-xs text-ink-3">Accountants record and post. Auditors can view and export everything but change nothing.</p>
      </Card>
      <Card className="p-5 md:p-6">
        <h2 className="mb-3 text-xl">Recent activity</h2>
        <ul className="grid gap-1.5 text-sm">
          {audit.map((a) => <li key={a.id} className="flex flex-wrap gap-x-2"><span className="text-ink-3">{a.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span><span>{a.user?.name ?? a.user?.email ?? "system"}</span><span className="text-ink-2">{a.action.replace(".", " · ")}</span>{a.entity === "Voucher" && <Link className="text-gold hover:underline" href={`/vouchers/${a.entityId}`}>view</Link>}</li>)}
          {audit.length === 0 && <li className="text-ink-2">No activity yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
