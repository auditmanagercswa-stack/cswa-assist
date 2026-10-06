import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { allowedTransitions, getOrderForActor } from "@/server/services/orders";

export const GET = route<{ id: string }>(async ({ params, actor }) => {
  const { order, role } = await getOrderForActor(params.id, requireActor(actor));
  return { order, role, actions: allowedTransitions(order.status, role) };
});
