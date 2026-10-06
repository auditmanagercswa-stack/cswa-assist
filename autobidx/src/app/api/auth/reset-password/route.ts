import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { passwordSchema } from "@/lib/validation";
import { resetPassword } from "@/server/services/accounts";

export const POST = route(
  async ({ req, ip, userAgent }) => {
    const { token, password } = await parseJson(req, z.object({ token: z.string().min(20), password: passwordSchema }));
    await resetPassword(token, password, { ip, userAgent });
    return { ok: true };
  },
  { rate: [10, 900], rateKey: "reset" },
);
