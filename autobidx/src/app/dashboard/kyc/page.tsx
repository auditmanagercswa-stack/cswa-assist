import { CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { KycForm } from "@/components/forms/kyc-form";
import { EmptyState } from "@/components/ui/empty";

export const metadata = { title: "KYC & Verification" };

export default async function KycPage() {
  const actor = (await getCurrentActor())!;
  if (!actor.dealer) return <EmptyState title="No dealership linked" description="KYC applies to dealership accounts." />;
  const [dealer, required] = await Promise.all([
    prisma.dealer.findUniqueOrThrow({ where: { id: actor.dealer.id }, include: { kyc: { orderBy: { createdAt: "desc" }, take: 1, include: { documents: { include: { file: { select: { originalName: true } } } } } } } }),
    getSetting("dealer.requiredKycDocs"),
  ]);
  const k = dealer.kyc[0];
  const manager = actor.dealer.role === "OWNER" || actor.dealer.role === "MANAGER";
  const locked = dealer.status === "VERIFIED" || dealer.status === "UNDER_REVIEW" || !manager;
  const Icon = dealer.status === "VERIFIED" ? CheckCircle2 : dealer.status === "REJECTED" ? XCircle : dealer.status === "SUSPENDED" ? ShieldAlert : Clock;
  return (
    <div>
      <PageHeader title="KYC & Verification" subtitle="Only verified dealers can bid, buy and publish listings" />
      <Card className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><Icon className="h-7 w-7 text-ink-900" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><span className="text-lg font-bold text-ink-900">{dealer.name}</span><StatusBadge status={dealer.status} /></div>
            <div className="text-[13px] text-slate-500">PAN {dealer.pan} · GSTIN {dealer.gstin ?? "—"}{dealer.verifiedAt ? ` · verified ${formatDate(dealer.verifiedAt)}` : ""}</div>
            {dealer.statusReason && <div className="mt-1 text-[13px] text-red-700">{dealer.statusReason}</div>}
          </div>
        </div>
        {!manager && <p className="mt-3 text-[13px] text-slate-500">Only the dealership owner or a manager can edit KYC.</p>}
        {dealer.status === "UNDER_REVIEW" && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[13px] text-blue-800">Your documents are under review. You&apos;ll be notified once verification is complete.</p>}
      </Card>
      <Card>
        <KycForm
          locked={locked}
          required={required}
          initial={k ? { ...k, documents: k.documents.map((d) => ({ type: d.type, fileId: d.fileId, name: d.file.originalName })) } : null}
        />
      </Card>
    </div>
  );
}
