import { getCurrentActor } from "@/server/auth/session";
import { getMakes, getStates } from "@/server/services/catalog";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/ui/card";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "List a vehicle" };

export default async function NewVehicle() {
  const actor = (await getCurrentActor())!;
  if (!actor.dealer?.canList) return <EmptyState title="You can't list vehicles" description="Your dealership role doesn't allow listing. Ask your dealership owner for access." action={<ButtonLink href="/dashboard">Back</ButtonLink>} />;
  const [makes, states, maxImages] = await Promise.all([getMakes(), getStates(), getSetting("listing.maxImages")]);
  return (
    <div>
      <PageHeader eyebrow="New listing" title="List a vehicle" subtitle="Complete details sell faster. You can save a draft and finish later." />
      <VehicleForm makes={makes} states={states} maxImages={maxImages} verified={actor.dealer.status === "VERIFIED"} />
    </div>
  );
}
