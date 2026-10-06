import { randomBytes } from "crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars

export function shortCode(len = 6): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function stamp() {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const orderNumber = () => `ALC-${stamp()}-${shortCode(6).toUpperCase()}`;
export const paymentReference = () => `PAY-${stamp()}-${shortCode(8).toUpperCase()}`;
export const invoiceNumber = (prefix: string) => `${prefix}/${stamp()}/${shortCode(6).toUpperCase()}`;
export const disputeNumber = () => `DSP-${stamp()}-${shortCode(5).toUpperCase()}`;
