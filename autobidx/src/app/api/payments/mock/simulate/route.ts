import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { shortCode } from "@/lib/ids";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { signMockWebhook } from "@/server/payments/mock";
import { handleWebhook } from "@/server/services/payments";

/**
 * SANDBOX ONLY — plays the role of the payment provider's servers. It builds an HMAC-signed
 * webhook and delivers it to our normal webhook handler (same verification path as production).
 * Disabled in production.
 */
export const POST = route(async ({ req, actor }) => {
  if (env.isProduction || env.paymentGateway !== "mock") throw new AppError("FORBIDDEN", "The sandbox gateway is disabled.");
  const a = requireActor(actor);
  const { paymentId, outcome } = await parseJson(req, z.object({ paymentId: z.string().min(1), outcome: z.enum(["success", "failure"]) }));
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== a.userId || p.gateway !== "mock") throw notFound("Payment not found.");
  if (p.status !== "PENDING") throw new AppError("CONFLICT", "This payment is already processed.");
  const gatewayPaymentId = `mock_pay_${shortCode(12)}`;
  const event = {
    id: `evt_${shortCode(14)}`,
    event: outcome === "success" ? "payment.captured" : "payment.failed",
    orderId: p.gatewayOrderId,
    paymentId: gatewayPaymentId,
    amount: p.amount,
    reason: outcome === "failure" ? "Payment declined by issuing bank (sandbox)" : undefined,
  };
  const { raw, signature } = signMockWebhook(event);
  await handleWebhook("mock", raw, new Headers({ "x-mock-signature": signature }));
  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return { status: updated.status, orderId: updated.orderId, purpose: updated.purpose };
});
