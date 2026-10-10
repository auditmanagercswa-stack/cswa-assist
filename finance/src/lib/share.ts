import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC signature so a customer can open one invoice PDF without logging in. */
const key = () => process.env.AUTH_SECRET ?? "dev-only-secret";
export const signId = (kind: string, id: string) => createHmac("sha256", key()).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
export function verifyId(kind: string, id: string, sig: string | null) {
  if (!sig) return false;
  const a = Buffer.from(signId(kind, id)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const appUrl = () => process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const invoiceShareUrl = (id: string) => `${appUrl()}/share/invoice/${id}?sig=${signId("invoice", id)}`;
