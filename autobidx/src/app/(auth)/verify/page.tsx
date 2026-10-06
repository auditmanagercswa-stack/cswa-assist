import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { VerifyForms } from "./verify-forms";

export const metadata: Metadata = { title: "Verify your account", robots: { index: false } };

export default async function VerifyPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=/verify");
  return (
    <div className="w-full max-w-md">
      <h1 className="text-[30px] font-bold text-ink-900">Verify your account</h1>
      <p className="mt-1 text-sm text-slate-500">Confirm your email and mobile number to secure your account.</p>
      <VerifyForms email={actor.email} phone={actor.phone} emailVerified={actor.emailVerified} phoneVerified={actor.phoneVerified} />
    </div>
  );
}
