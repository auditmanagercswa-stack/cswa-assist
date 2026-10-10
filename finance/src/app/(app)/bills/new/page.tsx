import { redirect } from "next/navigation";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/client";
import { PageTitle } from "@/components/ui/misc";
import { BillForm } from "@/components/docs/bill-form";

export const metadata = { title: "New bill" };

export default async function NewBillPage() {
  const ctx = await getCtx();
  if (ctx.role === "AUDITOR") redirect("/payables");
  const [vendors, ledgers] = await Promise.all([
    db.party.findMany({ where: { companyId: ctx.company.id, kind: { in: ["VENDOR", "BOTH"] } }, orderBy: { name: "asc" } }),
    db.ledger.findMany({ where: { companyId: ctx.company.id, isActive: true, group: { nature: { in: ["EXPENSE", "ASSET"] } }, kind: "GENERAL" }, include: { group: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageTitle pre="Record a" em="purchase" post="bill" sub="Snap the bill to prefill it. We suggest TDS from the vendor's section and post input GST automatically." />
      <BillForm companyState={ctx.company.stateCode} aiOn={aiEnabled()}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, stateCode: v.stateCode, creditDays: v.creditDays, tdsSection: v.tdsSection, gstin: v.gstin }))}
        ledgers={ledgers.map((l) => ({ id: l.id, name: l.name, group: l.group.name }))} />
    </div>
  );
}
