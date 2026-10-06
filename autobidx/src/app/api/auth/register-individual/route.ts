import { NextResponse } from "next/server";
import { route, parseJson } from "@/server/http";
import { registerIndividualSchema } from "@/lib/validation";
import { registerIndividual } from "@/server/services/accounts";
import { createSession, sessionCookie } from "@/server/auth/session";

export const POST = route(
  async ({ req, ip, userAgent }) => {
    const input = await parseJson(req, registerIndividualSchema);
    const { user } = await registerIndividual(input, { ip, userAgent });
    const { token, expiresAt } = await createSession(user.id, { ip, userAgent });
    const res = NextResponse.json({ ok: true, next: "/verify" }, { status: 201 });
    res.cookies.set(sessionCookie(token, expiresAt));
    return res;
  },
  { rate: [5, 600], rateKey: "register" },
);
