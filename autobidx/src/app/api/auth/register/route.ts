import { NextResponse } from "next/server";
import { route, parseJson } from "@/server/http";
import { registerDealerSchema } from "@/lib/validation";
import { registerDealer } from "@/server/services/accounts";
import { createSession, sessionCookie } from "@/server/auth/session";

export const POST = route(
  async ({ req, ip, userAgent }) => {
    const input = await parseJson(req, registerDealerSchema);
    const { user, dealer } = await registerDealer(input, { ip, userAgent, acceptLanguage: req.headers.get("accept-language") });
    const { token, expiresAt } = await createSession(user.id, { ip, userAgent });
    const res = NextResponse.json({ ok: true, userId: user.id, dealerId: dealer.id, next: "/register?step=3" }, { status: 201 });
    res.cookies.set(sessionCookie(token, expiresAt));
    return res;
  },
  { rate: [5, 600], rateKey: "register" },
);
