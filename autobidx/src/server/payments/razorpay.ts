import { hmacSha256, safeEqual } from "@/lib/crypto";
import { GatewaySignatureError, type GatewayEvent, type PaymentGateway } from "./gateway";

/**
 * Razorpay adapter (Orders API + Checkout). Requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET. Signatures are verified server-side per Razorpay docs.
 * Note: allow https://checkout.razorpay.com in the CSP when enabling client checkout.
 */
const API = "https://api.razorpay.com/v1";

function auth() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay is not configured");
  return { id, secret, header: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") };
}

export const razorpayGateway: PaymentGateway = {
  name: "razorpay",
  displayName: "Razorpay",
  async createOrder(input) {
    const a = auth();
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: a.header, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: input.amount * 100, currency: "INR", receipt: input.reference, notes: { paymentId: input.paymentId } }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed (${res.status})`);
    const order = (await res.json()) as { id: string };
    return {
      gatewayOrderId: order.id,
      redirectUrl: null,
      clientPayload: { key: a.id, order_id: order.id, amount: input.amount * 100, currency: "INR", name: "Alpha Cars", description: input.description, prefill: input.customer },
    };
  },
  async verifyCallback(p) {
    const { secret } = auth();
    const expected = hmacSha256(secret, `${p.razorpay_order_id}|${p.razorpay_payment_id}`);
    if (!p.razorpay_signature || !safeEqual(expected, p.razorpay_signature)) throw new GatewaySignatureError("Invalid Razorpay signature");
    return { eventId: `cb_${p.razorpay_payment_id}`, type: "payment.captured", gatewayOrderId: p.razorpay_order_id, gatewayPaymentId: p.razorpay_payment_id, raw: p };
  },
  async verifyWebhook(rawBody, headers) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error("Razorpay webhook secret not configured");
    const sig = headers.get("x-razorpay-signature") ?? "";
    if (!safeEqual(hmacSha256(secret, rawBody), sig)) throw new GatewaySignatureError("Invalid Razorpay webhook signature");
    const body = JSON.parse(rawBody);
    const ev = String(body.event);
    const pay = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    const type: GatewayEvent["type"] =
      ev === "payment.captured" || ev === "order.paid" ? "payment.captured" : ev === "payment.failed" ? "payment.failed" : ev === "refund.processed" ? "refund.processed" : ev === "refund.failed" ? "refund.failed" : "other";
    return {
      eventId: headers.get("x-razorpay-event-id") ?? `${ev}_${pay?.id ?? refund?.id}`,
      type,
      gatewayOrderId: pay?.order_id,
      gatewayPaymentId: pay?.id ?? refund?.payment_id,
      gatewayRefundId: refund?.id,
      amount: pay?.amount ? Math.round(pay.amount / 100) : refund?.amount ? Math.round(refund.amount / 100) : undefined,
      failureReason: pay?.error_description,
      raw: body,
    };
  },
  async refund(input) {
    const a = auth();
    const res = await fetch(`${API}/payments/${input.gatewayPaymentId}/refund`, {
      method: "POST",
      headers: { Authorization: a.header, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: input.amount * 100, receipt: input.refundRef, notes: { reason: input.reason } }),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed (${res.status})`);
    const r = (await res.json()) as { id: string; status: string };
    return { gatewayRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" };
  },
};
