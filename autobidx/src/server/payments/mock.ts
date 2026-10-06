import { hmacSha256, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { shortCode } from "@/lib/ids";
import { GatewaySignatureError, type GatewayEvent, type PaymentGateway } from "./gateway";

/**
 * Sandbox gateway for development & demos. It behaves like a hosted-checkout provider:
 * the hosted page (/pay/mock/[id]) asks the *gateway side* (/api/payments/mock/simulate) to
 * complete the payment, which then sends an HMAC-signed webhook to our webhook endpoint.
 * The application only trusts the signed webhook — exactly as with a real provider.
 * Disabled when APP_MODE=production.
 */
export const mockGateway: PaymentGateway = {
  name: "mock",
  displayName: "AutoBidX Sandbox Gateway",
  async createOrder(input) {
    return { gatewayOrderId: `mock_order_${shortCode(12)}`, redirectUrl: `/pay/mock/${input.paymentId}` };
  },
  async verifyWebhook(rawBody, headers) {
    const sig = headers.get("x-mock-signature") ?? "";
    const expected = hmacSha256(env.paymentWebhookSecret, rawBody);
    if (!safeEqual(sig, expected)) throw new GatewaySignatureError("Invalid mock webhook signature");
    const body = JSON.parse(rawBody) as { id: string; event: GatewayEvent["type"]; orderId?: string; paymentId?: string; refundId?: string; amount?: number; reason?: string };
    return { eventId: body.id, type: body.event, gatewayOrderId: body.orderId, gatewayPaymentId: body.paymentId, gatewayRefundId: body.refundId, amount: body.amount, failureReason: body.reason, raw: body };
  },
  async refund() {
    return { gatewayRefundId: `mock_rfnd_${shortCode(10)}`, status: "PROCESSED" };
  },
};

/** Used by the sandbox "gateway side" to sign its webhook. */
export function signMockWebhook(body: unknown) {
  const raw = JSON.stringify(body);
  return { raw, signature: hmacSha256(env.paymentWebhookSecret, raw) };
}
