import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppError } from "@/lib/errors";
import { getCurrentActor } from "@/server/auth/session";
import { getOrderForActor } from "@/server/services/orders";
import { OrderDetail } from "@/components/dashboard/order-detail";

export const metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const actor = (await getCurrentActor())!;
  let data;
  try {
    data = await getOrderForActor(id, actor);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <div>
      <Link href="/dashboard/orders" className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />All orders</Link>
      {payment === "paid" && <div className="mb-4 rounded-xl bg-verified-50 px-4 py-3 text-[14px] font-semibold text-verified-600">Payment successful and verified. The seller has been notified.</div>}
      {payment === "failed" && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-700">Payment failed. You can retry from checkout before the payment window closes.</div>}
      <OrderDetail data={data} actor={actor} />
    </div>
  );
}
