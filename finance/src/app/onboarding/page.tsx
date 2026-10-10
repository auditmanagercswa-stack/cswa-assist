import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { createCompanyWithChart, ensureDueDates } from "@/lib/company";
import { validateGstin, validatePan, validateTan, stateOfGstin } from "@/lib/accounting/core";
import { fyStartYear, todayUTC } from "@/lib/fy";
import { STATES } from "@/config/tax";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LegalType } from "@prisma/client";

export const metadata = { title: "Set up your company" };

async function create(f: FormData) {
  "use server";
  const user = await requireUser();
  const gstin = String(f.get("gstin") || "").trim().toUpperCase() || null;
  const pan = String(f.get("pan") || "").trim().toUpperCase() || null;
  const tan = String(f.get("tan") || "").trim().toUpperCase() || null;
  if (gstin && !validateGstin(gstin).ok) redirect("/onboarding?error=gstin");
  if (pan && !validatePan(pan)) redirect("/onboarding?error=pan");
  if (tan && !validateTan(tan)) redirect("/onboarding?error=tan");
  const company = await db.$transaction((t) => createCompanyWithChart(t, user.id, {
    name: String(f.get("name")).trim(), legalType: String(f.get("legalType")) as LegalType,
    stateCode: gstin ? stateOfGstin(gstin) : String(f.get("state")), gstin, pan: pan ?? (gstin ? gstin.slice(2, 12) : null), tan,
  }, String(f.get("bank") || "Bank Account")), { timeout: 20000 });
  await ensureDueDates(db, company.id, fyStartYear(todayUTC()));
  (await cookies()).set("cid", company.id, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/");
}

const ERR: Record<string, string> = { gstin: "That GSTIN doesn't pass the format and check-digit test.", pan: "PAN should look like ABCDE1234F.", tan: "TAN should look like PNEA12345B." };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-lg p-6">
        <h1 className="text-3xl">Set up your <em className="text-gold">company</em></h1>
        <p className="mb-5 mt-1 text-sm text-ink-2">We&apos;ll create a Tally-style chart of accounts and your FY compliance calendar.</p>
        {error && <p className="mb-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{ERR[error] ?? "Check the details and try again."}</p>}
        <form action={create} className="grid gap-3">
          <Label>Business name<Input name="name" required placeholder="e.g. Sharma Traders" /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>Constitution<Select name="legalType" defaultValue="PROPRIETORSHIP">
              <option value="PROPRIETORSHIP">Proprietorship</option><option value="PARTNERSHIP">Partnership firm</option><option value="LLP">LLP</option><option value="PRIVATE_LIMITED">Private limited company</option>
            </Select></Label>
            <Label>State<Select name="state" defaultValue="27">{Object.entries(STATES).map(([c, s]) => <option key={c} value={c}>{c} · {s}</option>)}</Select></Label>
          </div>
          <Label>GSTIN (optional)<Input name="gstin" maxLength={15} className="uppercase" placeholder="27ABCDE1234F1Z5" /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>PAN (optional)<Input name="pan" maxLength={10} className="uppercase" /></Label>
            <Label>TAN (for TDS reminders)<Input name="tan" maxLength={10} className="uppercase" /></Label>
          </div>
          <Label>Main bank account name<Input name="bank" placeholder="HDFC Bank" /></Label>
          <Button type="submit" size="lg" className="mt-2">Create company</Button>
        </form>
      </Card>
    </main>
  );
}
