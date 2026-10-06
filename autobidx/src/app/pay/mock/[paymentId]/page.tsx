import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatINR, humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { MockGatewayActions } from "./actions";

export const metadata = { title: "Sandbox payment", robots: { index: false } };

/** Hosted page of the development sandbox gateway (stands in for a real provider's checkout). */
export default async function MockGatewayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  if (env.isProduction) notFound();
  const { paymentId } = await params;
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=/pay/mock/${paymentId}`);
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== actor.userId || p.gateway !== "mock") notFound();
  const back = p.orderId ? `/dashboard/orders/${p.orderId}` : "/dashboard/payments";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-200 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-slate-800 px-6 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Sandbox · test mode</div>
          <div className="text-lg font-bold">Sandbox Payment Gateway</div>
          <div className="text-[12px] text-white/60">Simulates a hosted checkout for development. No real money moves.</div>
        </div>
        <div className="space-y-3 p-6">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Merchant</span><span className="font-semibold">AutoBidX</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Reference</span><span className="font-mono">{p.reference}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Method</span><span className="font-semibold">{humanize(p.method ?? "UPI")}</span></div>
          <div className="flex justify-between border-t pt-3"><span className="text-slate-500">Amount</span><span className="num text-2xl font-bold">{formatINR(p.amount)}</span></div>
          {p.status !== "PENDING" ? (
            <div className="rounded-lg bg-slate-100 p-3 text-center text-sm">This payment is already {p.status.toLowerCase()}. <a className="font-semibold underline" href={back}>Return to AutoBidX</a></div>
          ) : (
            <MockGatewayActions paymentId={p.id} back={back} />
          )}
        </div>
      </div>
    </div>
  );
}
