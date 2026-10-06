import type { PaymentGateway } from "./gateway";

/** Stripe adapter — integration pending. Implement with Checkout Sessions + webhook signing secret. */
export const stripeGateway: PaymentGateway = {
  name: "stripe",
  displayName: "Stripe (integration pending)",
  async createOrder() {
    throw new Error("Stripe integration is pending. Configure STRIPE_SECRET_KEY and implement the adapter.");
  },
  async verifyWebhook() {
    throw new Error("Stripe integration is pending.");
  },
  async refund() {
    throw new Error("Stripe integration is pending.");
  },
};
