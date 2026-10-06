import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { verifyOtp } from "@/server/services/accounts";

export const POST = route(
  async ({ req, actor }) => {
    const a = requireActor(actor);
    const { purpose, code } = await parseJson(req, z.object({ purpose: z.enum(["EMAIL_VERIFY", "PHONE_VERIFY"]), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }));
    await verifyOtp(a.userId, purpose, code);
    return { ok: true };
  },
  { rate: [10, 300], rateKey: "verify" },
);
