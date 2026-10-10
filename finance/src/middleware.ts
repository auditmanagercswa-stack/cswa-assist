import { NextResponse, type NextRequest } from "next/server";

/** Cheap edge check: no session cookie → login. Real authorisation happens in getCtx(). */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (!has) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!login|api/auth|api/health|_next|favicon|.*\\.).*)"] };
