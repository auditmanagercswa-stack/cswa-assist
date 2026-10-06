import { Heart } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { cardSelect } from "@/server/services/vehicles";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const actor = (await getCurrentActor())!;
  const items = await prisma.watchlist.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, include: { vehicle: { select: cardSelect } } });
  return (
    <div>
      <PageHeader title="Watchlist" subtitle="We'll alert you before watched auctions end" />
      {items.length === 0 ? (
        <EmptyState icon={<Heart className="h-7 w-7" />} title="No saved vehicles" description="Tap the heart on any vehicle to save it here and get auction-ending alerts." action={<ButtonLink href="/vehicles">Browse vehicles</ButtonLink>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((w) => <VehicleCard key={w.vehicleId} v={w.vehicle} watching signedIn serverTime={new Date().toISOString()} />)}</div>
      )}
    </div>
  );
}
