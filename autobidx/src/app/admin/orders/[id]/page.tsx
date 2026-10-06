import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { getOrderForActor } from "@/server/services/orders";
import { OrderDetail } from "@/components/dashboard/order-detail";

export const metadata = { title: "Order" };

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "orders.manage");
  const { id } = await params;
  let data;
  try {
    data = await getOrderForActor(id, actor);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <div>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Orders</Link>
      <OrderDetail data={data} actor={actor} admin />
    </div>
  );
}
