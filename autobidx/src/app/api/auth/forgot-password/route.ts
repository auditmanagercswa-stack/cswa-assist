import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requestPasswordReset } from "@/server/services/accounts";

export const POST = route(
  async ({ req, ip, userAgent }) => {
    const { email } = await parseJson(req, z.object({ email: z.string().trim().email("Enter a valid email") }));
    const { devLink } = await requestPasswordReset(email, { ip, userAgent });
    return { ok: true, message: "If an account exists for this email, a reset link has been sent.", devLink };
  },
  { rate: [5, 900], rateKey: "forgot" },
);
