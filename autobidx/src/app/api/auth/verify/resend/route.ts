import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { issueOtp } from "@/server/services/accounts";

export const POST = route(
  async ({ req, actor }) => {
    const a = requireActor(actor);
    const { purpose } = await parseJson(req, z.object({ purpose: z.enum(["EMAIL_VERIFY", "PHONE_VERIFY"]) }));
    const { devCode } = await issueOtp(a.userId, purpose);
    return { ok: true, devCode };
  },
  { rate: [5, 600], rateKey: "otp" },
);
