import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { raiseDispute } from "@/server/services/disputes";

export const POST = route<{ id: string }>(
  async ({ req, params, actor }) => {
    const input = await parseJson(
      req,
      z.object({
        category: z.enum(["CONDITION_MISMATCH", "DOCUMENTATION", "PAYMENT", "DELIVERY", "FRAUD", "BUYER_CANCELLATION", "OTHER"]),
        subject: z.string().trim().min(5, "Add a short subject").max(120),
        description: z.string().trim().min(20, "Describe the issue in at least 20 characters").max(4000),
      }),
    );
    const d = await raiseDispute(requireActor(actor), { orderId: params.id, ...input });
    return { id: d.id, number: d.number };
  },
  { rate: [5, 600], rateKey: "dispute" },
);
