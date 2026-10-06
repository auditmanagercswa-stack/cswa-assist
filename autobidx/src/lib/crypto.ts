import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "./env";

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const hmacSha256 = (secret: string, data: string | Buffer) =>
  createHmac("sha256", secret).update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function randomOtp(digits = 6): string {
  const n = randomBytes(4).readUInt32BE(0) % 10 ** digits;
  return String(n).padStart(digits, "0");
}

function fieldKey(): Buffer {
  const k = process.env.FIELD_ENCRYPTION_KEY;
  if (k) {
    const buf = Buffer.from(k, "base64");
    if (buf.length === 32) return buf;
  }
  return createHash("sha256").update(`field-enc:${env.authSecret}`).digest();
}

/** AES-256-GCM encryption for sensitive fields such as bank account numbers. */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptField(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
