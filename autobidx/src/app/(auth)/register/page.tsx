import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { getStates } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { RegisterWizard } from "./wizard";

export const metadata: Metadata = { title: "Join as a dealer", description: "Register your used-car dealership on Alpha Cars to buy and sell through verified auctions." };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ step?: string; type?: string }> }) {
  const sp = await searchParams;
  const actor = await getCurrentActor();
  const [states, s] = await Promise.all([getStates(), getSettings(["features.individualBuyers", "dealer.requiredKycDocs", "dealer.requireGstin"])]);
  let kyc = null;
  let dealerStatus: string | null = null;
  let statusReason: string | null = null;
  if (actor?.dealer) {
    const d = await prisma.dealer.findUnique({
      where: { id: actor.dealer.id },
      include: { kyc: { orderBy: { createdAt: "desc" }, take: 1, include: { documents: { include: { file: { select: { originalName: true } } } } } } },
    });
    dealerStatus = d?.status ?? null;
    statusReason = d?.statusReason ?? null;
    const k = d?.kyc[0];
    if (k) kyc = { ...k, documents: k.documents.map((x) => ({ type: x.type, fileId: x.fileId, name: x.file.originalName })) };
  }
  const step = actor?.dealer ? (dealerStatus === "PENDING" || dealerStatus === "REJECTED" ? (sp.step === "4" ? 4 : 3) : 4) : 1;
  return (
    <RegisterWizard
      initialStep={step}
      states={states}
      individualEnabled={s["features.individualBuyers"]}
      requiredDocs={s["dealer.requiredKycDocs"]}
      requireGstin={s["dealer.requireGstin"]}
      kyc={kyc}
      dealerStatus={dealerStatus}
      statusReason={statusReason}
      signedInAs={actor ? { name: actor.name, dealer: actor.dealer?.name ?? null, emailVerified: actor.emailVerified, phoneVerified: actor.phoneVerified } : null}
    />
  );
}
