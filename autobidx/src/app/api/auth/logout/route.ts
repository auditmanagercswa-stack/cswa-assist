import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { clearedSessionCookie, revokeSession } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const POST = route(async ({ actor, ip }) => {
  if (actor) {
    await revokeSession(actor.sessionId);
    await audit({ userId: actor.userId, action: "auth.logout", entityType: "User", entityId: actor.userId, ip });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
});
