import { NextResponse } from "next/server";
import { route, parseJson } from "@/server/http";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/server/services/accounts";
import { createSession, sessionCookie } from "@/server/auth/session";
import { buildActor } from "@/server/auth/rbac";

export const POST = route(
  async ({ req, ip, userAgent }) => {
    const { identifier, password } = await parseJson(req, loginSchema);
    const user = await authenticate(identifier, password, { ip, userAgent });
    const { token, expiresAt, sessionId } = await createSession(user.id, { ip, userAgent });
    const actor = await buildActor(user.id, sessionId);
    const next = actor?.permissions.has("admin.access") ? "/admin" : "/dashboard";
    const res = NextResponse.json({ ok: true, next });
    res.cookies.set(sessionCookie(token, expiresAt));
    return res;
  },
  { rate: [20, 300], rateKey: "login" },
);
