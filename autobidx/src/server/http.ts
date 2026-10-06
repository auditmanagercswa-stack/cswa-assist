import { NextResponse } from "next/server";
import { ZodError, type ZodSchema, type z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getActorFromRequest } from "./auth/session";
import type { Actor } from "./auth/rbac";
import { rateLimit } from "./ratelimit";

export type Ctx<P = Record<string, string>> = {
  req: Request;
  actor: Actor | null;
  params: P;
  ip: string | null;
  userAgent: string | null;
};

export function clientIp(req: Request): string | null {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? null)?.trim() || null;
}

/** CSRF defence for cookie-authenticated mutations: Origin (or Referer) must match our host. */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  // Bearer-token API clients are not subject to ambient-cookie CSRF.
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) {
    if (process.env.NODE_ENV === "test") return;
    throw new AppError("FORBIDDEN", "Request origin could not be verified.");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "Request origin could not be verified.");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([host, new URL(env.appUrl).host].filter(Boolean));
  if (!allowed.has(originHost)) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const k = issue.path.join(".") || "_";
      if (!fields[k]) fields[k] = issue.message;
    }
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } } },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists.", details: null } }, { status: 409 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found.", details: null } }, { status: 404 });
  }
  // Never leak stack traces to clients.
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again.", details: null } }, { status: 500 });
}

type Handler<P> = (ctx: Ctx<P>) => Promise<Response | unknown>;

type Options = {
  /** Rate limit bucket: [max requests, window seconds] keyed by IP (+ user when signed in). */
  rate?: [number, number];
  rateKey?: string;
  csrf?: boolean;
};

/** Wraps a route handler with auth resolution, CSRF, rate limiting and uniform error mapping. */
export function route<P = Record<string, string>>(handler: Handler<P>, opts: Options = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      const ip = clientIp(req);
      const actor = await getActorFromRequest(req);
      if (opts.rate) {
        const [max, windowSec] = opts.rate;
        const key = `${opts.rateKey ?? new URL(req.url).pathname}:${actor?.userId ?? ip ?? "anon"}`;
        if (!rateLimit(key, max, windowSec * 1000)) throw new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly.");
      }
      const params = (await context?.params) ?? ({} as P);
      const out = await handler({ req, actor, params, ip, userAgent: req.headers.get("user-agent") });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<S extends ZodSchema>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 1_000_000) throw new AppError("BAD_REQUEST", "Request body too large.");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("BAD_REQUEST", "Invalid JSON body.");
  }
  return schema.parse(body);
}

export function parseQuery<S extends ZodSchema>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) {
    if (k in obj) obj[k] = ([] as string[]).concat(obj[k], v);
    else obj[k] = v;
  }
  return schema.parse(obj);
}
