import type { PaymentMethod } from "@prisma/client";

/**
 * Payment gateway abstraction. Adding Razorpay/Stripe/PayU/Cashfree is a matter of implementing
 * this interface — order, payment and refund logic never talks to a provider directly.
 */
export type CreateOrderInput = {
  paymentId: string;
  reference: string;
  amount: number; // INR rupees
  method: PaymentMethod;
  customer: { name: string; email: string; phone: string };
  description: string;
};

export type CreateOrderResult = {
  gatewayOrderId: string;
  /** Where to send the browser (hosted checkout), or null when the client SDK opens checkout. */
  redirectUrl: string | null;
  /** Public data the client SDK needs (never secrets). */
  clientPayload?: Record<string, unknown>;
  /** For offline methods (bank transfer), payment stays PROCESSING until reconciled. */
  offline?: boolean;
};

/** Normalised, signature-verified event from a provider webhook or redirect callback. */
export type GatewayEvent = {
  eventId: string;
  type: "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed" | "other";
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayRefundId?: string;
  amount?: number;
  failureReason?: string;
  raw: unknown;
};

export interface PaymentGateway {
  readonly name: string;
  readonly displayName: string;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /** Verifies a webhook (raw body + headers). Throws on bad signature. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<GatewayEvent>;
  /** Verifies a browser redirect/callback payload (e.g. Razorpay signature). Throws on bad signature. */
  verifyCallback?(payload: Record<string, string>): Promise<GatewayEvent>;
  refund(input: { gatewayPaymentId: string; amount: number; reason: string; refundRef: string }): Promise<{ gatewayRefundId: string; status: "PROCESSED" | "PENDING" }>;
}

export class GatewaySignatureError extends Error {}
