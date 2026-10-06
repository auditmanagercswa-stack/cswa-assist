import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { passwordSchema } from "@/lib/validation";
import { changePassword } from "@/server/services/accounts";

export const POST = route(
  async ({ req, actor }) => {
    const a = requireActor(actor);
    const { current, next } = await parseJson(req, z.object({ current: z.string().min(1, "Enter your current password"), next: passwordSchema }));
    await changePassword(a.userId, current, next, a.sessionId);
    return { ok: true };
  },
  { rate: [5, 600], rateKey: "chpw" },
);
