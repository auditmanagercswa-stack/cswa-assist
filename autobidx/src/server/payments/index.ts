import { env } from "@/lib/env";
import type { PaymentGateway } from "./gateway";
import { mockGateway } from "./mock";
import { razorpayGateway } from "./razorpay";
import { stripeGateway } from "./stripe";
import { bankTransferGateway } from "./bank-transfer";

const registry: Record<string, PaymentGateway> = {
  mock: mockGateway,
  razorpay: razorpayGateway,
  stripe: stripeGateway,
  bank_transfer: bankTransferGateway,
};

export function getGateway(name: string): PaymentGateway {
  const g = registry[name];
  if (!g) throw new Error(`Unknown payment gateway ${name}`);
  if (name === "mock" && env.isProduction) throw new Error("Sandbox gateway is disabled in production");
  return g;
}

/** The online gateway configured for card/UPI/net-banking payments. */
export function onlineGateway(): PaymentGateway {
  return getGateway(env.paymentGateway);
}
