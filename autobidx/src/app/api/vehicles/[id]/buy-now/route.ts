import { route } from "@/server/http";
import { buyNow } from "@/server/services/sales";

export const POST = route<{ id: string }>(
  async ({ params, actor, ip }) => {
    const order = await buyNow({ vehicleId: params.id, actor, ip });
    return { orderId: order.id, orderNumber: order.orderNumber, next: `/checkout/${order.id}` };
  },
  { rate: [10, 60], rateKey: "buynow" },
);
