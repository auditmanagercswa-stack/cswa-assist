// Client-safe formatting helpers (Indian locale).

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return inr.format(Math.round(amount));
}

/** ₹5.25 L / ₹1.2 Cr style compact price used on cards. */
export function formatINRCompact(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 1_00_00_000) return `₹${trim(amount / 1_00_00_000)} Cr`;
  if (amount >= 1_00_000) return `₹${trim(amount / 1_00_000)} L`;
  if (amount >= 1_000) return `₹${trim(amount / 1_000)}K`;
  return formatINR(amount);
}

function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return num.format(n);
}

export function formatKm(km: number): string {
  return `${num.format(km)} km`;
}

export function formatDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function timeAgo(d: Date | string): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  return formatDate(d);
}

/** Splits a millisecond duration into a compact countdown label. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ended";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function humanize(enumValue: string | null | undefined): string {
  if (!enumValue) return "—";
  const special: Record<string, string> = { CNG: "CNG", LPG: "LPG", AMT: "AMT", CVT: "CVT", DCT: "DCT", SUV: "SUV", MUV: "MUV", RC: "RC", UPI: "UPI", KYC: "KYC" };
  return enumValue
    .split("_")
    .map((w) => special[w] ?? w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function maskRegistration(reg: string | null | undefined): string {
  if (!reg) return "—";
  const clean = reg.replace(/\s+/g, "").toUpperCase();
  // KL07CX1234 → KL-07-XX-**34
  const m = clean.match(/^([A-Z]{2})(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-XX-**${clean.slice(-2)}` : "Registered";
}

export function pluralize(n: number, one: string, many = one + "s") {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
