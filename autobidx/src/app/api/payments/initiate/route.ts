import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { initiateOrderPayment, initiateServicePayment } from "@/server/services/payments";

const METHODS = ["UPI", "NETBANKING", "CARD", "BANK_TRANSFER"] as const;
const schema = z.union([
  z.object({ orderId: z.string().min(1), method: z.enum(METHODS) }),
  z.object({ purpose: z.enum(["LISTING_FEE", "AUCTION_FEE", "FEATURED_LISTING", "SUBSCRIPTION"]), targetId: z.string().min(1), method: z.enum(METHODS) }),
]);

// Note: the client never sends an amount — it is always computed on the server.
export const POST = route(
  async ({ req, actor, ip }) => {
    const a = requireActor(actor);
    const body = await parseJson(req, schema);
    if ("orderId" in body) return initiateOrderPayment({ orderId: body.orderId, actor: a, method: body.method, ip });
    return initiateServicePayment({ actor: a, purpose: body.purpose, targetId: body.targetId, method: body.method, ip });
  },
  { rate: [10, 60], rateKey: "pay-init" },
);
