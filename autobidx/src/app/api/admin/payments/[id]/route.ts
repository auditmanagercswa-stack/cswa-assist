import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { confirmBankTransfer, refundPayment, rejectBankTransfer } from "@/server/services/payments";

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const a = adminGuard(actor, "payments.manage");
  const body = await parseJson(
    req,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("confirm"), note: z.string().max(300).default("") }),
      z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("refund"), amount: z.coerce.number().int().positive(), reason: z.string().trim().min(3, "Give a reason").max(300) }),
    ]),
  );
  if (body.action === "confirm") await confirmBankTransfer(params.id, a, body.note);
  else if (body.action === "reject") await rejectBankTransfer(params.id, a, body.reason);
  else await refundPayment({ paymentId: params.id, amount: body.amount, reason: body.reason, actor: a, ip });
  return { ok: true };
});
