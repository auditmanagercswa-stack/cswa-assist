import { shortCode } from "@/lib/ids";
import type { PaymentGateway } from "./gateway";

/**
 * Offline NEFT/RTGS/IMPS. Buyer submits the UTR; the payment stays PROCESSING until a finance
 * admin reconciles the bank statement and confirms it (Admin → Payments). No webhook.
 */
export const bankTransferGateway: PaymentGateway = {
  name: "bank_transfer",
  displayName: "Bank transfer (NEFT / RTGS / IMPS)",
  async createOrder() {
    return { gatewayOrderId: `bt_${shortCode(10)}`, redirectUrl: null, offline: true };
  },
  async verifyWebhook() {
    throw new Error("Bank transfers are reconciled manually.");
  },
  async refund() {
    // Refund to the remitter account is processed manually by finance.
    return { gatewayRefundId: `bt_rfnd_${shortCode(8)}`, status: "PENDING" };
  },
};
