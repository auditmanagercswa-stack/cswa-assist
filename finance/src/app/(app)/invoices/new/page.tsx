import { redirect } from "next/navigation";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui/misc";
import { InvoiceForm } from "@/components/docs/invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const ctx = await getCtx();
  if (ctx.role === "AUDITOR") redirect("/invoices");
  const customers = await db.party.findMany({ where: { companyId: ctx.company.id, kind: { in: ["CUSTOMER", "BOTH"] } }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageTitle pre="New tax" em="invoice" sub="Place of supply decides CGST + SGST (same state) or IGST (other state). Posting is automatic." />
      <InvoiceForm companyState={ctx.company.stateCode} gstRegistered={!!ctx.company.gstin}
        customers={customers.map((c) => ({ id: c.id, name: c.name, stateCode: c.stateCode, creditDays: c.creditDays, gstin: c.gstin }))} />
    </div>
  );
}
