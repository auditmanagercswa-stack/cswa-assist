import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { submitBankTransferUtr } from "@/server/services/payments";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const { utr } = await parseJson(req, z.object({ utr: z.string().trim().min(8, "Enter the UTR / reference").max(22) }));
  return submitBankTransferUtr(params.id, requireActor(actor), utr);
});
