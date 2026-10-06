import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildActor, type Actor } from "./rbac";

export const SESSION_COOKIE = "abx_session";
const SESSION_DAYS = 7;

const key = () => new TextEncoder().encode(env.authSecret);

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const session = await prisma.session.create({
    data: { userId, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, expiresAt },
  });
  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setIssuer("autobidx")
    .sign(key());
  return { token, expiresAt, sessionId: session.id };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function clearedSessionCookie() {
  return { name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
}

async function verifyToken(token: string | undefined | null): Promise<{ sid: string; uid: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "autobidx", algorithms: ["HS256"] });
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    return { sid: payload.sid, uid: payload.sub };
  } catch {
    return null;
  }
}

/** Resolves the actor for a raw session token: validates JWT, DB session (revocation) and user status. */
export async function actorFromToken(token: string | undefined | null): Promise<Actor | null> {
  const claims = await verifyToken(token);
  if (!claims) return null;
  const session = await prisma.session.findUnique({ where: { id: claims.sid } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== claims.uid) return null;
  // Touch at most every 5 minutes to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const actor = await buildActor(claims.uid, session.id);
  if (!actor || actor.status !== "ACTIVE") return null;
  return actor;
}

export function tokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export const getActorFromRequest = (req: Request) => actorFromToken(tokenFromRequest(req));

/** For Server Components / layouts. Cached per request. */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  return actorFromToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? null)?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {});
}
