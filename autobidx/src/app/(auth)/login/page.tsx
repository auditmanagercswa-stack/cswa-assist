import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentActor } from "@/server/auth/session";
import { LoginForm } from "./login-form";
import { safeNext } from "@/lib/slug";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const DEMO = [
  { role: "Super Admin", email: "admin@alphacars.in", password: "Admin@123" },
  { role: "Dealer — Seller", email: "seller@alphacars.in", password: "Demo@1234" },
  { role: "Dealer — Buyer", email: "buyer@alphacars.in", password: "Demo@1234" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const actor = await getCurrentActor();
  if (actor) redirect(safeNext(next));
  // Demo credentials are only ever rendered outside production mode.
  return (
    <Suspense>
      <LoginForm demo={env.isProduction ? [] : DEMO} />
    </Suspense>
  );
}
