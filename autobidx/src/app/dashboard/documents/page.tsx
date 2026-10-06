import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const [docs, kyc] = await Promise.all([
    prisma.document.findMany({
      where: { order: { OR: [{ buyerId: actor.userId }, { buyerDealerId: dealerId }, { sellerDealerId: dealerId }] } },
      include: { order: { select: { id: true, orderNumber: true, sellerDealerId: true, vehicle: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.kycDocument.findMany({ where: { kyc: { dealerId } }, include: { file: { select: { id: true, originalName: true } } } }),
  ]);
  return (
    <div>
      <PageHeader title="Documents" subtitle="Invoices, sale agreements, challans, receipts, RC & insurance copies" />
      <DataTable
        rows={docs}
        rowKey={(r) => r.id}
        mobileTitle={(r) => humanize(r.type)}
        empty={<EmptyState icon={<FileText className="h-7 w-7" />} title="No documents yet" description="Documents are generated automatically when you buy or sell a vehicle." />}
        columns={[
          { key: "t", header: "Document", hideOnMobile: true, cell: (r) => <span className="font-semibold text-ink-900">{r.type === "INVOICE" && r.order.sellerDealerId === dealerId ? "Platform fee invoice" : humanize(r.type)}</span> },
          { key: "o", header: "Order", cell: (r) => <Link href={`/dashboard/orders/${r.order.id}`} className="font-mono text-[12.5px] hover:text-ignite-600">{r.order.orderNumber}</Link> },
          { key: "v", header: "Vehicle", cell: (r) => r.order.vehicle.title },
          { key: "d", header: "Date", cell: (r) => formatDate(r.createdAt) },
          { key: "x", header: "", align: "right", cell: (r) => <a href={`/api/documents/${r.id}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-ignite-600">Open</a> },
        ]}
      />
      {kyc.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-sans text-[16px] font-bold text-ink-900">KYC documents</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {kyc.map((k) => (
              <a key={k.id} href={`/api/files/${k.file.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] hover:border-ink-900">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" />{humanize(k.type)}</span>
                <span className={k.verified ? "text-[12px] font-semibold text-verified-600" : "text-[12px] text-slate-400"}>{k.verified ? "Verified" : "Submitted"}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
