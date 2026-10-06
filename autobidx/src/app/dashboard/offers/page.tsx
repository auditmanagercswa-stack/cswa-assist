import Link from "next/link";
import { Handshake } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { vehiclePath } from "@/lib/slug";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { OfferCard } from "@/components/dashboard/offer-card";

export const metadata = { title: "Offers" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "received" } = await searchParams;
  const actor = (await getCurrentActor())!;
  const side = tab === "sent" ? "BUYER" : "SELLER";
  const offers = await prisma.offer.findMany({
    where: side === "SELLER" ? { sellerDealerId: actor.dealer?.id ?? "none" } : { buyerId: actor.userId },
    include: {
      vehicle: { select: { title: true, code: true, year: true, expectedPrice: true, make: { select: { slug: true } }, model: { select: { slug: true } }, images: { take: 1, orderBy: { sortOrder: "asc" } } } },
      buyer: { select: { name: true, dealerMemberships: { take: 1, select: { dealer: { select: { name: true } } } } } },
      sellerDealer: { select: { name: true } },
      counters: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
  });
  const sorted = [...offers].sort((a, b) => Number(b.awaiting === side && ["PENDING", "COUNTERED"].includes(b.status)) - Number(a.awaiting === side && ["PENDING", "COUNTERED"].includes(a.status)));
  return (
    <div>
      <PageHeader title="Offers" subtitle="Negotiate directly — accept, decline or counter" />
      <div className="mb-4 flex gap-1.5">
        {[["received", "Received (selling)"], ["sent", "Sent (buying)"]].map(([k, l]) => (
          <Link key={k} href={`/dashboard/offers?tab=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>
        ))}
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={<Handshake className="h-7 w-7" />} title={side === "SELLER" ? "No offers received" : "No offers sent"} description={side === "SELLER" ? "Enable 'Accept offers' on your listings to receive offers from verified buyers." : "Make an offer on any listing that accepts offers."} action={<ButtonLink href={side === "SELLER" ? "/dashboard/vehicles" : "/vehicles"}>{side === "SELLER" ? "Manage listings" : "Browse vehicles"}</ButtonLink>} />
      ) : (
        <div className="space-y-4">
          {sorted.map((o) => (
            <OfferCard
              key={o.id}
              side={side}
              o={{
                id: o.id,
                status: o.status,
                amount: o.amount,
                currentAmount: o.currentAmount,
                awaiting: o.awaiting,
                expiresAt: o.expiresAt.toISOString(),
                createdAt: o.createdAt.toISOString(),
                message: o.message,
                vehicle: { title: o.vehicle.title, href: vehiclePath(o.vehicle), expectedPrice: o.vehicle.expectedPrice, thumb: o.vehicle.images[0]?.thumbUrl ?? null },
                counterparty: side === "SELLER" ? (o.buyer.dealerMemberships[0]?.dealer.name ?? o.buyer.name) : o.sellerDealer.name,
                counters: o.counters.map((c) => ({ by: c.by, amount: c.amount, message: c.message, at: c.createdAt.toISOString() })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
